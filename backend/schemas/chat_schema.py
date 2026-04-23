from pydantic import BaseModel
from datetime import datetime
from typing import Optional # Add this import

class ChatCreate(BaseModel):
    content: str
    session_token: Optional[str] = None

class ChatResponse(BaseModel):
    id: int
    session_id: int
    content: str
    role: str
    timestamp: datetime
    edited_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ChatSessionResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    session_token: Optional[str] = None
    created_at: datetime
    messages: list[ChatResponse] = []

    class Config:
        from_attributes = True