from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, field_validator
from app.core.config import INTERVIEW_QUESTION_MAX, INTERVIEW_ANSWER_MAX

class InterviewIn(BaseModel):
    question: str = Field(min_length=1,max_length=INTERVIEW_QUESTION_MAX)
    mode: Literal['records','llm'] = 'records'
    @field_validator('question')
    @classmethod
    def nonempty(cls,value):
        if not value.strip(): raise ValueError('질문을 입력하세요.')
        return value.strip()

class EvidenceOut(BaseModel):
    log_id:int
    screen_id:str
    screen_label:str
    turn:int
    action:str
    quote:str|None=None
    target:str|None=None

class InterviewMessageOut(BaseModel):
    id:int
    question:str
    answer:str
    mode:Literal['records','llm']
    evidence:list[EvidenceOut]
    created_at:datetime

class InterviewOut(BaseModel):
    run_id:int
    persona_id:int
    source:Literal['live','local-demo']
    llm_allowed:bool
    history_limit:int
    messages:list[InterviewMessageOut]

class ModelAnswer(BaseModel):
    answer:str = Field(min_length=1,max_length=INTERVIEW_ANSWER_MAX)
    evidence_log_ids:list[int]
    unverified:bool

class LocalDemoOut(BaseModel):
    study_id:int
    run_id:int
    source:Literal['local-demo']='local-demo'