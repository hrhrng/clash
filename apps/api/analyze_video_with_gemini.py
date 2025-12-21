import asyncio
import sys
import uuid
import os
from pathlib import Path

# Add src to path to import master_clash modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'src')))

from google.cloud import storage
from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from master_clash.config import get_settings

def print_banner(text):
    print("\n" + "="*50)
    print(f" {text}")
    print("="*50 + "\n", flush=True)

scene_changes = '''
场景变化点（基于帧embedding检测）：
1. 0:05 - distance: 0.339 (明显变化)
2. 0:10 - distance: 0.312 (明显变化)  
3. 0:35 - distance: 0.122
4. 0:40 - distance: 0.140
5. 1:10 - distance: 0.108
6. 1:15 - distance: 0.115
7. 1:25 - distance: 0.114
8. 1:30 - distance: 0.108
9. 1:40 - distance: 0.104
10. 2:35 - distance: 0.107
11. 4:10 - distance: 0.101
12. 4:50 - distance: 0.129
'''

prompt = f'''
你是一个专业的视频分析师。我给你一个深圳航拍"一镜到底"视频和基于帧embedding检测到的场景变化点列表。

{scene_changes}

请分析这个视频，回答以下问题：

1. **场景描述**：每个变化点对应的画面内容是什么？请用简短的词描述每个时间点看到的主要内容。

2. **变化原因分析**：这些变化点为什么被检测出来？是真正的场景变化（如地标交替）还是只是画面移动/视角变换？

3. **场景合并建议**：哪些变化点可以合并为同一个"逻辑场景"？建议划分为几个真正有意义的场景？

4. **高光时刻**：如果要剪辑这个视频的精华片段，你推荐哪几个时间段？

请用表格格式输出场景描述。
'''

async def main():
    settings = get_settings()
    video_path = '/tmp/shenzhen_video.mp4'
    
    if not os.path.exists(video_path):
        print(f"Error: Video file not found at {video_path}")
        return

    # 1. Sync upload to GCS with progress reporting
    print_banner("STEP 1: Uploading video to GCS")
    client = storage.Client()
    bucket = client.bucket(settings.gcs_bucket_name)
    blob_name = f"temp/gemini_analysis/{uuid.uuid4()}/shenzhen.mp4"
    blob = bucket.blob(blob_name)
    
    file_size = os.path.getsize(video_path)
    print(f"Uploading {video_path} ({file_size / 1024 / 1024:.2f} MB) to gs://{settings.gcs_bucket_name}/{blob_name}...")
    
    class ProgressFileWrapper:
        def __init__(self, filename):
            self.file = open(filename, 'rb')
            self.total = os.path.getsize(filename)
            self.current = 0
            self.last_pct = -1

        def read(self, n=-1):
            chunk = self.file.read(n)
            self.current += len(chunk)
            pct = int(self.current / self.total * 100)
            if pct != self.last_pct:
                print(f"Upload PROGRESS: {pct}% ({self.current / 1024 / 1024:.1f}/{self.total / 1024 / 1024:.1f} MB)", flush=True)
                self.last_pct = pct
            return chunk

        def __len__(self):
            return self.total

        def close(self):
            self.file.close()

        def tell(self):
            return self.file.tell()

        def seek(self, offset, whence=0):
            return self.file.seek(offset, whence)

    pw = ProgressFileWrapper(video_path)
    try:
        blob.upload_from_file(pw, content_type='video/mp4', timeout=1200)
    finally:
        pw.close()
    
    gcs_uri = f"gs://{settings.gcs_bucket_name}/{blob_name}"
    print(f"Upload complete: {gcs_uri}")
    
    # 2. Call Gemini 3 Pro Preview via Vertex AI
    print_banner("STEP 2: Calling Gemini 3 Pro Preview")
    
    # Configure model as requested by user
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-pro",
        vertexai=True,
        include_thoughts=True,
        thinking_budget=1000,
        streaming=True,
    )
    
    print(f"Sending prompt and video to {llm.model}...")
    
    content_block = [
        {'type': 'text', 'text': prompt},
        {'type': 'media', 'file_uri': gcs_uri, 'mime_type': 'video/mp4'},
    ]
    
    message = HumanMessage(content=content_block)
    
    try:
        print("Waiting for streaming response...\n", flush=True)
        full_response = ""
        async for chunk in llm.astream([message]):
            content = chunk.content
            
            # Handle list-type content (thinking process)
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict):
                        if item.get('type') == 'thinking':
                            print(f"\033[90m[Thinking: {item.get('thinking')}]\033[0m", flush=True)
                        elif item.get('type') == 'text':
                            text = item.get('text', '')
                            print(text, end="", flush=True)
                            full_response += text
            else:
                # Standard string content
                print(content, end="", flush=True)
                full_response += str(content)
        
        print("\n\n" + "-"*30)
        print("Analysis finished successfully.")
        print("-"*30 + "\n")
        
    except Exception as e:
        print(f"\nError during Gemini call: {e}")
        import traceback
        traceback.print_exc()
    
    # 3. Cleanup
    print_banner("STEP 3: Cleaning up")
    print(f"Deleting {gcs_uri}...")
    try:
        blob.delete()
        print("Cleanup successful.")
    except Exception as e:
        print(f"Cleanup failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
