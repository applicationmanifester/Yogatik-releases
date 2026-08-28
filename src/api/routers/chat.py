from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..services import memory, llm, safety

router = APIRouter()

class ChatRequest(BaseModel):
    session_id: str
    message: str

class ChatResponse(BaseModel):
    reply: str

@router.post("/chat", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest):
    # Safety check on user input
    if not safety.is_safe(req.message):
        raise HTTPException(status_code=400, detail="Input violates safety policy.")

    # Pull short-term memory
    history = memory.get_recent(req.session_id, limit=20)

    # Generate assistant reply
    reply = llm.generate_reply(history, req.message)

    # Safety check on model output
    if not safety.is_safe(reply):
        raise HTTPException(status_code=500, detail="Generated content blocked by safety filter.")

    # Persist both turns
    memory.add_message(req.session_id, "user", req.message)
    memory.add_message(req.session_id, "assistant", reply)

    return ChatResponse(reply=reply)