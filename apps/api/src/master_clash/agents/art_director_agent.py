"""
Art Director Agent - 美术指导
负责根据剧本创建角色、场景、道具的视觉设定图
使用 nano_banana 生成图片,并进行筛选排序
"""

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

from models import CharacterProfile, SceneLocation, Screenplay
from pydantic import BaseModel
from tools.nano_banana import nano_banana_gen, nano_banana_pro_gen
from utils import save_base64_image

# ========================================
# 美术设定数据结构
# ========================================

class GeneratedImage(BaseModel):
    """生成的图片记录"""
    image_id: str  # 唯一标识
    prompt: str  # 生成提示词
    file_path: str  # 保存路径
    generation_time: str  # 生成时间
    quality_score: float | None = None  # 质量评分(0-1)
    is_selected: bool = False  # 是否被选中作为最终版本
    notes: str = ""  # 备注


class CharacterDesign(BaseModel):
    """角色视觉设定"""
    character_name: str  # 角色名称
    reference_description: str  # 参考描述(来自剧本)
    visual_style_direction: str  # 视觉风格指导
    generated_images: list[GeneratedImage]  # 所有生成的图片
    final_selected_image: str | None = None  # 最终选定的图片路径


class LocationDesign(BaseModel):
    """场景视觉设定"""
    location_name: str  # 场景名称
    reference_description: str  # 参考描述(来自剧本)
    visual_style_direction: str  # 视觉风格指导
    generated_images: list[GeneratedImage]  # 所有生成的图片
    final_selected_image: str | None = None  # 最终选定的图片路径


class ProductionDesign(BaseModel):
    """完整的美术设定"""
    project_title: str  # 项目名称
    overall_visual_style: str  # 整体视觉风格
    character_designs: list[CharacterDesign]  # 角色设计
    location_designs: list[LocationDesign]  # 场景设计
    creation_timestamp: str  # 创建时间


# ========================================
# 美术指导核心逻辑
# ========================================

class ArtDirector:
    """美术指导 - 负责视觉创作与管理"""

    def __init__(self, output_dir: str = "./output/art_designs"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.logger = logging.getLogger(__name__)

    def _create_character_prompt(
        self,
        character: CharacterProfile,
        visual_style: str
    ) -> str:
        """根据角色档案创建图片生成提示词"""
        prompt = f"""Character Design Sheet - {character.character_name}

VISUAL STYLE: {visual_style}

CHARACTER DESCRIPTION:
{character.literary_physical_description}

ROLE: {character.narrative_role}
AGE: {character.approximate_age}

PERSONALITY TRAITS: {', '.join(character.key_personality_traits)}

BACKSTORY VISUAL CLUES:
{character.character_backstory[:200]}...

Create a detailed character design showing:
- Full body view (front)
- Clear facial features matching the description
- Costume/clothing reflecting their personality and role
- Consistent with the overall visual style

Style: Concept art, clean lines, professional production design
"""
        return prompt

    def _create_location_prompt(
        self,
        location: SceneLocation,
        visual_style: str
    ) -> str:
        """根据场景地点创建图片生成提示词"""
        prompt = f"""Environment/Location Design - {location.location_name}

VISUAL STYLE: {visual_style}

LOCATION DESCRIPTION:
{location.evocative_description}

ATMOSPHERE: {location.atmospheric_feeling}
TIME PERIOD: {location.historical_time_setting}

{f'SYMBOLIC MEANING: {location.symbolic_significance}' if location.symbolic_significance else ''}

Create a detailed environment concept art:
- Wide establishing shot showing the space
- Atmospheric lighting matching the mood
- Architectural/environmental details
- NO CHARACTERS in the scene
- Consistent with the overall visual style

Style: Concept art, cinematic composition, production design quality
"""
        return prompt

    def generate_character_design(
        self,
        character: CharacterProfile,
        visual_style: str,
        num_variations: int = 3,
        use_pro: bool = False
    ) -> CharacterDesign:
        """
        为角色生成视觉设定图

        Args:
            character: 角色档案
            visual_style: 整体视觉风格
            num_variations: 生成变体数量
            use_pro: 是否使用 Pro 模型

        Returns:
            CharacterDesign 包含所有生成图片
        """
        self.logger.info(f"Generating design for character: {character.character_name}")

        # 创建角色专属目录
        char_dir = self.output_dir / "characters" / character.character_name
        char_dir.mkdir(parents=True, exist_ok=True)

        # 生成提示词
        base_prompt = self._create_character_prompt(character, visual_style)

        generated_images = []
        generator = nano_banana_pro_gen if use_pro else nano_banana_gen

        # 生成多个变体
        for i in range(num_variations):
            try:
                self.logger.info(f"  Generating variation {i+1}/{num_variations}...")

                # 每个变体添加轻微变化
                variation_prompt = base_prompt
                if i > 0:
                    variation_prompt += f"\n\nVariation {i+1}: Slightly different pose or angle"

                # 生成图片
                image_data = generator(
                    text=variation_prompt,
                    system_prompt="You are a professional concept artist creating production design for film.",
                    aspect_ratio="4:3"
                )

                # 保存图片
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                image_id = f"{character.character_name}_v{i+1}_{timestamp}"
                file_path = str(char_dir / f"{image_id}.png")
                save_base64_image(image_data, file_path)

                # 记录
                generated_images.append(GeneratedImage(
                    image_id=image_id,
                    prompt=variation_prompt,
                    file_path=file_path,
                    generation_time=timestamp,
                    notes=f"Variation {i+1}"
                ))

                self.logger.info(f"  Saved to: {file_path}")

            except Exception as e:
                self.logger.error(f"  Failed to generate variation {i+1}: {e}")

        # 创建角色设计对象
        character_design = CharacterDesign(
            character_name=character.character_name,
            reference_description=character.literary_physical_description,
            visual_style_direction=visual_style,
            generated_images=generated_images
        )

        return character_design

    def generate_location_design(
        self,
        location: SceneLocation,
        visual_style: str,
        num_variations: int = 3,
        use_pro: bool = False
    ) -> LocationDesign:
        """
        为场景生成视觉设定图

        Args:
            location: 场景地点
            visual_style: 整体视觉风格
            num_variations: 生成变体数量
            use_pro: 是否使用 Pro 模型

        Returns:
            LocationDesign 包含所有生成图片
        """
        self.logger.info(f"Generating design for location: {location.location_name}")

        # 创建场景专属目录
        loc_dir = self.output_dir / "locations" / location.location_name.replace("/", "_")
        loc_dir.mkdir(parents=True, exist_ok=True)

        # 生成提示词
        base_prompt = self._create_location_prompt(location, visual_style)

        generated_images = []
        generator = nano_banana_pro_gen if use_pro else nano_banana_gen

        # 生成多个变体
        for i in range(num_variations):
            try:
                self.logger.info(f"  Generating variation {i+1}/{num_variations}...")

                # 每个变体添加轻微变化
                variation_prompt = base_prompt
                if i > 0:
                    variation_prompt += f"\n\nVariation {i+1}: Different camera angle or time of day"

                # 生成图片
                image_data = generator(
                    text=variation_prompt,
                    system_prompt="You are a professional environment artist creating production design for film.",
                    aspect_ratio="16:9"
                )

                # 保存图片
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                image_id = f"{location.location_name.replace('/', '_')}_v{i+1}_{timestamp}"
                file_path = str(loc_dir / f"{image_id}.png")
                save_base64_image(image_data, file_path)

                # 记录
                generated_images.append(GeneratedImage(
                    image_id=image_id,
                    prompt=variation_prompt,
                    file_path=file_path,
                    generation_time=timestamp,
                    notes=f"Variation {i+1}"
                ))

                self.logger.info(f"  Saved to: {file_path}")

            except Exception as e:
                self.logger.error(f"  Failed to generate variation {i+1}: {e}")

        # 创建场景设计对象
        location_design = LocationDesign(
            location_name=location.location_name,
            reference_description=location.evocative_description,
            visual_style_direction=visual_style,
            generated_images=generated_images
        )

        return location_design

    def create_production_design(
        self,
        screenplay: Screenplay,
        characters_to_design: list[str] | None = None,
        locations_to_design: list[str] | None = None,
        num_variations: int = 3,
        use_pro: bool = False,
        parallel: bool = True,
        max_workers: int = 4
    ) -> ProductionDesign:
        """
        为整个项目创建美术设定

        Args:
            screenplay: 完整剧本
            characters_to_design: 要设计的角色名列表(None = 全部)
            locations_to_design: 要设计的场景名列表(None = 全部)
            num_variations: 每个设计的变体数量
            use_pro: 是否使用 Pro 模型
            parallel: 是否并行生成(默认True)
            max_workers: 最大并行工作线程数(默认4)

        Returns:
            ProductionDesign 包含所有美术设定
        """
        self.logger.info(f"Creating production design for: {screenplay.screenplay_title}")

        # 提取整体视觉风格
        overall_visual_style = screenplay.style_guide.visual_style.aesthetic_shorthand

        # 准备要设计的角色和场景
        characters = screenplay.main_characters
        if characters_to_design:
            characters = [c for c in characters if c.character_name in characters_to_design]

        locations = screenplay.key_locations
        if locations_to_design:
            locations = [
                location for location in locations if location.location_name in locations_to_design
            ]

        if parallel:
            self.logger.info(f"🚀 Using parallel mode (max_workers={max_workers})")
            character_designs, location_designs = self._parallel_generation(
                characters=characters,
                locations=locations,
                visual_style=overall_visual_style,
                num_variations=num_variations,
                use_pro=use_pro,
                max_workers=max_workers
            )
        else:
            self.logger.info("🐌 Using serial mode")
            character_designs, location_designs = self._serial_generation(
                characters=characters,
                locations=locations,
                visual_style=overall_visual_style,
                num_variations=num_variations,
                use_pro=use_pro
            )

        # 创建完整设计对象
        production_design = ProductionDesign(
            project_title=screenplay.screenplay_title,
            overall_visual_style=overall_visual_style,
            character_designs=character_designs,
            location_designs=location_designs,
            creation_timestamp=datetime.now().isoformat()
        )

        # 保存设计记录
        self._save_design_manifest(production_design)

        return production_design

    def _serial_generation(
        self,
        characters: list[CharacterProfile],
        locations: list[SceneLocation],
        visual_style: str,
        num_variations: int,
        use_pro: bool
    ) -> tuple[list[CharacterDesign], list[LocationDesign]]:
        """串行生成角色和场景设计"""
        character_designs = []
        location_designs = []

        # 生成角色设计
        for character in characters:
            design = self.generate_character_design(
                character=character,
                visual_style=visual_style,
                num_variations=num_variations,
                use_pro=use_pro
            )
            character_designs.append(design)

        # 生成场景设计
        for location in locations:
            design = self.generate_location_design(
                location=location,
                visual_style=visual_style,
                num_variations=num_variations,
                use_pro=use_pro
            )
            location_designs.append(design)

        return character_designs, location_designs

    def _parallel_generation(
        self,
        characters: list[CharacterProfile],
        locations: list[SceneLocation],
        visual_style: str,
        num_variations: int,
        use_pro: bool,
        max_workers: int
    ) -> tuple[list[CharacterDesign], list[LocationDesign]]:
        """并行生成角色和场景设计"""
        character_designs = []
        location_designs = []

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {}

            # 提交角色设计任务
            for character in characters:
                future = executor.submit(
                    self.generate_character_design,
                    character=character,
                    visual_style=visual_style,
                    num_variations=num_variations,
                    use_pro=use_pro
                )
                futures[future] = ("character", character.character_name)

            # 提交场景设计任务
            for location in locations:
                future = executor.submit(
                    self.generate_location_design,
                    location=location,
                    visual_style=visual_style,
                    num_variations=num_variations,
                    use_pro=use_pro
                )
                futures[future] = ("location", location.location_name)

            # 收集结果
            for future in as_completed(futures):
                task_type, name = futures[future]
                try:
                    result = future.result()
                    if task_type == "character":
                        character_designs.append(result)
                        self.logger.info(f"   ✅ Character: {name}")
                    else:
                        location_designs.append(result)
                        self.logger.info(f"   ✅ Location: {name}")
                except Exception as e:
                    self.logger.error(f"   ❌ Failed {task_type} '{name}': {e}")

        return character_designs, location_designs

    def _save_design_manifest(self, production_design: ProductionDesign):
        """保存美术设计清单为 JSON"""
        manifest_path = self.output_dir / f"{production_design.project_title}_manifest.json"

        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(
                production_design.model_dump(mode='json'),
                f,
                ensure_ascii=False,
                indent=2
            )

        self.logger.info(f"Saved design manifest to: {manifest_path}")


# ========================================
# 便捷函数
# ========================================

def generate_production_design(
    screenplay: Screenplay,
    output_dir: str = "./output/art_designs",
    characters_to_design: list[str] | None = None,
    locations_to_design: list[str] | None = None,
    num_variations: int = 3,
    use_pro: bool = False,
    parallel: bool = True,
    max_workers: int = 4
) -> ProductionDesign:
    """
    便捷函数: 为剧本生成美术设定

    Args:
        screenplay: 完整剧本
        output_dir: 输出目录
        characters_to_design: 要设计的角色名列表
        locations_to_design: 要设计的场景名列表
        num_variations: 每个设计的变体数量
        use_pro: 是否使用 Pro 模型
        parallel: 是否并行生成(默认True)
        max_workers: 最大并行工作线程数(默认4)

    Returns:
        ProductionDesign
    """
    art_director = ArtDirector(output_dir=output_dir)
    return art_director.create_production_design(
        screenplay=screenplay,
        characters_to_design=characters_to_design,
        locations_to_design=locations_to_design,
        num_variations=num_variations,
        use_pro=use_pro,
        parallel=parallel,
        max_workers=max_workers
    )


if __name__ == "__main__":
    # 测试代码
    logging.basicConfig(level=logging.INFO)

    print("Art Director Agent initialized")
    print("Use generate_production_design() to create visual designs from screenplay")
