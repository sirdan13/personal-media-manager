from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.user import UserCreate, UserLogin, UserOut, Token
from app.services.auth_service import create_user, authenticate_user
from app.core.security import create_access_token
from app.api.deps import get_current_user
from app.models.entities import User

router = APIRouter(prefix="/auth", tags=["Autenticazione"])

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    user = create_user(db, user_in)
    token = create_access_token(user.id)
    return Token(access_token=token, token_type="bearer", user=UserOut.model_validate(user))

@router.post("/login", response_model=Token)
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    user = authenticate_user(db, login_data)
    token = create_access_token(user.id)
    return Token(access_token=token, token_type="bearer", user=UserOut.model_validate(user))

@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)
