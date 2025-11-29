
from pydantic import BaseModel

# ========================================
# 编剧产出数据结构
# ========================================

# -----------------------------
# 1. 故事大纲
# -----------------------------
class StoryOutline(BaseModel):
    """故事核心概念"""
    one_sentence_logline: str  # 一句话故事概括(例: "一个失忆侦探在寻找真相的过程中发现自己就是凶手")
    central_theme: str  # 核心主题(例: "救赎", "身份认同", "权力的代价")
    story_genre: str  # 故事类型(例: "科幻惊悚", "黑色喜剧", "浪漫剧情")
    emotional_tone: str  # 情感基调(例: "轻松幽默", "黑暗压抑", "讽刺尖锐")
    intended_audience: str  # 目标观众(例: "25-40岁都市白领", "青少年", "艺术片爱好者")
    three_act_structure_summary: str  # 三幕结构概述(简述起承转合)


# -----------------------------
# 2. 角色塑造
# -----------------------------
class CharacterArc(BaseModel):
    """角色弧光 - 角色在故事中的成长轨迹"""
    character_at_story_beginning: str  # 故事开始时的状态(例: "一个愤世嫉俗、封闭内心的退休杀手")
    core_character_flaw: str  # 核心性格缺陷(例: "无法信任他人", "过度自信导致盲目")
    transformation_journey: str  # 转变过程(例: "通过保护一个孤儿,他逐渐学会关爱和信任")
    character_at_story_end: str  # 故事结束时的状态(例: "一个愿意为他人牺牲的守护者")


class CharacterProfile(BaseModel):
    """角色档案 - 用文学化语言描述角色,而非技术性规格"""
    character_name: str  # 角色姓名
    narrative_role: str  # 叙事角色(例: "主角", "对手", "导师", "盟友", "中立者")
    approximate_age: str  # 大致年龄(例: "30多岁", "青年", "中年")
    character_backstory: str  # 背景故事(塑造他成为现在这个人的经历)
    key_personality_traits: list[str]  # 关键性格特质(3-5个词,例: ["固执", "正直", "幽默", "敏感"])
    what_character_wants: str  # 核心动机 - 角色想要什么(例: "找到杀害妻子的凶手")
    inner_struggle: str  # 内在冲突(例: "在复仇与正义之间挣扎")
    outer_objective: str  # 外在目标(例: "追踪线索,找到真凶")
    character_arc: CharacterArc  # 角色弧光
    relationships_with_others: list[str]  # 与其他角色的关系(例: ["与李华是童年好友但暗藏嫉妒", "是王芳的导师但渐生情愫"])
    unique_way_of_speaking: str | None = None  # 独特说话方式(例: "总是用比喻说话", "习惯性自言自语")
    literary_physical_description: str  # 外貌的文学化描述(例: "一个面容憔悴的中年女性,眼神里有未曾熄灭的倔强")


# -----------------------------
# 3. 场景与氛围
# -----------------------------
class SceneLocation(BaseModel):
    """场景地点 - 用诗意语言描绘场所,而非建筑图纸"""
    location_name: str  # 地点名称(例: "老王的面馆", "废弃工厂", "天台")
    evocative_description: str  # 富有画面感的描述(例: "一间阴暗的地下室,墙上的水渍像泪痕,空气中弥漫着霉味和绝望")
    symbolic_significance: str | None = None  # 象征意义(例: "代表主角被困的过去")
    atmospheric_feeling: str  # 氛围感受(例: "压抑窒息", "温馨怀旧", "诡异不安")
    historical_time_setting: str  # 时代背景(例: "90年代", "2077年", "架空古代")


# -----------------------------
# 4. 剧本场次
# -----------------------------
class Dialogue(BaseModel):
    """对话 - 角色说的话及其言外之意"""
    speaking_character: str  # 说话角色名
    spoken_words: str  # 台词内容(角色实际说出的话)
    unspoken_subtext: str | None = None  # 潜台词(角色真正想表达但没说出口的,例: 台词"我很好"的潜台词可能是"我糟透了但不想让你担心")


class SceneAction(BaseModel):
    """场景动作 - 用现在时态描写正在发生的事"""
    action_description: str  # 动作/事件描述(例: "李明猛地推开门,雨水顺着他的脸颊滴落")
    emotional_beat_at_this_moment: str  # 此刻的情感节拍(例: "愤怒转为无助", "希望破灭")


class Scene(BaseModel):
    """场次 - 标准编剧格式的一场戏"""
    scene_number: int  # 场次编号
    location_name: str  # 地点(对应 SceneLocation.location_name)
    interior_or_exterior_and_time: str  # 内景/外景 + 时间(例: "INT. 日", "EXT. 夜", "INT./EXT. 黄昏")
    characters_in_this_scene: list[str]  # 本场出现的角色名列表
    why_this_scene_exists: str  # 这场戏的目的(例: "揭示主角的真实动机", "情节转折点", "建立角色关系")
    dominant_emotion: str  # 主导情感(例: "紧张", "温情", "绝望", "幽默")
    dramatic_conflict: str  # 戏剧冲突(例: "李明想隐瞒真相但王芳步步紧逼", "时间紧迫但资源不足")
    action_beats: list[SceneAction]  # 动作节拍序列
    dialogue_exchanges: list[Dialogue]  # 对话
    how_scene_changes_situation: str  # 场景如何改变局势(例: "主角获得关键线索", "关系破裂", "秘密被揭穿")
    transition_note: str | None = None  # 过渡说明(如需特殊过渡,例: "淡入淡出", "硬切至")


# -----------------------------
# 5. 分幕结构
# -----------------------------
class Act(BaseModel):
    """幕 - 三幕剧结构中的一幕"""
    act_number: int  # 第几幕(1/2/3)
    narrative_function_of_act: str  # 该幕的叙事功能(例: "建立世界与角色", "冲突升级与低谷", "高潮与解决")
    major_plot_points: list[str]  # 关键情节点(例: ["激励事件: 妻子被杀", "中点: 发现真凶身份", "最低点: 盟友背叛"])
    scenes_in_act: list[Scene]  # 该幕包含的所有场次


# -----------------------------
# 6. 主题与风格指导
# -----------------------------
class ThematicElements(BaseModel):
    """主题元素 - 故事想要探讨的深层议题"""
    primary_theme: str  # 核心主题(例: "救赎", "身份认同", "权力与腐败")
    secondary_themes: list[str]  # 辅助主题(例: ["父子关系", "城乡对立", "科技异化"])
    symbolic_objects_or_images: list[str]  # 象征物(例: ["破碎的镜子 - 象征破裂的自我", "红色围巾 - 象征失去的爱"])
    recurring_motifs: list[str]  # 重复出现的母题(例: ["镜头反复出现水的意象", "角色总是在说'我记得'"])


class VisualStyleConcept(BaseModel):
    """视觉风格概念 - 编剧用诗意语言勾勒视觉方向,而非技术参数"""
    aesthetic_shorthand: str  # 整体美学速记(例: "赛博朋克遇见王家卫", "70年代意大利犯罪片质感", "宫崎骏式奇幻现实主义")
    color_palette_description: str  # 色彩情绪描述(例: "冷峻的蓝灰色调,偶尔闪现霓虹粉红", "温暖的金黄与橙红,像秋日午后", "去饱和的忧郁色调")
    visual_reference_works: list[str]  # 视觉参考作品(例: ["《银翼杀手2049》", "王家卫《重庆森林》", "爱德华·霍普的画作", "森山大道的街头摄影"])
    era_and_aesthetic: str  # 时代美学(例: "2077年反乌托邦未来都市", "90年代香港的烟火气", "架空的蒸汽朋克维多利亚时代")
    world_visual_description: str  # 世界观的诗意视觉描述(例: "一个阶级严重分化的垂直城市,富人住在云端塔楼,穷人蜷缩在永不见光的底层街区,到处是老旧的霓虹招牌和线缆交织的天空")


class StyleGuide(BaseModel):
    """风格指南 - 作品的整体艺术方向"""
    visual_style: VisualStyleConcept  # 视觉风格概念(诗意的,非技术性的)
    storytelling_perspective: str  # 叙事视角(例: "第三人称全知", "第一人称限制视角", "多视角交叉叙事")
    rhythm_and_pacing: str  # 节奏与步调(例: "快节奏动作与慢镜头冥想交替", "缓慢燃烧式的张力积累", "碎片化的快剪")
    overall_mood_adjectives: list[str]  # 整体氛围形容词(5-8个,例: ["忧郁", "怀旧", "诗意", "暴力", "温柔", "疏离", "荒诞"])
    tonal_description: str  # 基调的细致描述(例: "黑色幽默与温情交织,在荒诞中寻找人性的光辉", "冷峻克制的表面下涌动着激烈情感")


# -----------------------------
# 7. 剧本总成
# -----------------------------
class Screenplay(BaseModel):
    """完整剧本 - 包含故事、角色、风格、场景的完整编剧作品"""
    screenplay_title: str  # 剧本标题
    story_outline: StoryOutline  # 故事大纲(logline, 主题, 类型, 三幕概述)
    thematic_elements: ThematicElements  # 主题元素(主题, 象征, 母题)
    style_guide: StyleGuide  # 风格指南(视觉概念 + 叙事风格)
    main_characters: list[CharacterProfile]  # 主要角色档案(含弧光)
    key_locations: list[SceneLocation]  # 关键场景地点
    three_acts: list[Act]  # 三幕剧本(每幕包含多场戏)
