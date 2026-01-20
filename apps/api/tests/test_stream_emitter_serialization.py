import json

from langchain_core.messages import HumanMessage

from master_clash.api.stream_emitter import StreamEmitter


def _extract_sse_data(event_text: str) -> dict:
    for line in event_text.splitlines():
        if line.startswith("data: "):
            return json.loads(line.removeprefix("data: "))
    raise AssertionError("No SSE data line found")


def test_stream_emitter_serializes_langchain_messages():
    emitter = StreamEmitter()
    payload = {
        "messages": [HumanMessage(content="hello")],
        "meta": {"ok": True},
    }

    event_text = emitter.format_event("custom", payload, thread_id=None)
    decoded = _extract_sse_data(event_text)

    assert decoded["meta"]["ok"] is True
    assert decoded["messages"][0]["type"] == "human"
    assert decoded["messages"][0]["content"] == "hello"

