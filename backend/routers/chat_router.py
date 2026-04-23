from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime
import uuid
from database import get_db
from models.chat import ChatMessage, ChatSession
from models.user import User
from schemas.chat_schema import ChatCreate, ChatResponse, ChatSessionResponse
from services.chatbot_service import generate_ai_response
from routers.auth_router import get_current_user

router = APIRouter(prefix="/chat", tags=["Chat"])

@router.get("/history", response_model=list[ChatSessionResponse])
def get_user_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sessions = db.query(ChatSession).filter(ChatSession.user_id == current_user.user_id).order_by(desc(ChatSession.created_at)).all()
    return sessions

@router.get("/admin/sessions", response_model=list[ChatSessionResponse])
def get_all_sessions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    return db.query(ChatSession).order_by(desc(ChatSession.created_at)).all()

@router.get("/admin/stats")
def get_chat_admin_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Calculate today's stats
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    sessions_today = db.query(ChatSession).filter(ChatSession.created_at >= today).all()
    
    conversations_count = len(sessions_today)
    active_users = len(set(s.user_id for s in sessions_today))
    
    return [
        {"label": "Conversations Today", "value": str(conversations_count)},
        {"label": "Avg Response Time", "value": "1.5s"}, # Mocked logical deduction
        {"label": "Satisfaction Rate", "value": "95%"},  # Synthesized feedback
        {"label": "Active Users", "value": str(active_users)},
    ]

@router.get("/admin/sessions/{session_id}", response_model=list[ChatResponse])
def get_session_messages(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    return db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.timestamp.asc()).all()

@router.post("/send")
def send_message(chat: ChatCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # 1. Find or create session
    session = None
    if chat.session_token:
        session = db.query(ChatSession).filter(ChatSession.session_token == chat.session_token).first()
    
    if not session:
        session = ChatSession(
            user_id=current_user.user_id,
            session_token=chat.session_token or str(uuid.uuid4())
        )
        db.add(session)
        db.commit()
        db.refresh(session)

    # 2. Save user message
    user_msg = ChatMessage(session_id=session.id, content=chat.content, role="user")
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    # 3. Generate AI response
    ai_reply = generate_ai_response(chat.content)

    # 4. Save AI message
    bot_msg = ChatMessage(session_id=session.id, content=ai_reply, role="assistant")
    db.add(bot_msg)
    db.commit()
    db.refresh(bot_msg)

    return {"session_token": session.session_token, "user": user_msg, "assistant": bot_msg}

@router.delete("/{message_id}")
def delete_message(message_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    msg = db.query(ChatMessage).filter(ChatMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
        
    if msg.role == "user":
        next_msg = db.query(ChatMessage).filter(ChatMessage.id > message_id, ChatMessage.session_id == msg.session_id).order_by(ChatMessage.id.asc()).first()
        if next_msg and next_msg.role == "assistant":
            db.delete(next_msg)
            
    db.delete(msg)
    db.commit()
    return {"deleted": message_id}