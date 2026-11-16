from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.entities import User
from app.schemas.user import UserCreate, UserLogin
from app.core.security import hash_password, verify_password

def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email.lower().strip()).first()

def get_user_by_id(db: Session, user_id: str) -> User | None:
    return db.query(User).filter(User.id == user_id).first()

def create_user(db: Session, user_in: UserCreate) -> User:
    existing = get_user_by_email(db, user_in.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un utente con questo indirizzo email è già registrato"
        )
    
    user = User(
        email=user_in.email.lower().strip(),
        password_hash=hash_password(user_in.password),
        display_name=user_in.display_name or user_in.email.split("@")[0]
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def authenticate_user(db: Session, login_data: UserLogin) -> User:
    user = get_user_by_email(db, login_data.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenziali di accesso non valide"
        )
    if not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenziali di accesso non valide"
        )
    return user
