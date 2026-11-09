from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Run,Study,Persona,Prototype,Task,ActLog,InterviewThread,InterviewMessage,LocalDemoStudy
from app.core.config import INTERVIEW_HISTORY_LIMIT
from app.repositories import workflow as workflow_repo

async def context(session:AsyncSession,run_id:int,persona_id:int,user_id:int):
    run=await session.scalar(select(Run).join(Study,Study.id==Run.study_id).where(Run.id==run_id,Study.user_id==user_id))
    if run is None or run.mode!='act':return None
    from app.repositories.workspace import is_trashed
    if await is_trashed(session,run.study_id):return None
    persona=await session.scalar(select(Persona).where(Persona.id==persona_id,Persona.study_id==run.study_id))
    if persona is None:return None
    proto=await session.scalar(select(Prototype).where(Prototype.study_id==run.study_id))
    task=await session.scalar(select(Task).where(Task.study_id==run.study_id))
    rows=list(await session.scalars(select(ActLog).where(ActLog.run_id==run.id,ActLog.participant_type=='ai',ActLog.participant_id==persona.id).order_by(ActLog.id)))
    source='local-demo' if await session.get(LocalDemoStudy,run.study_id) else 'live'
    captured=await workflow_repo.evidence(session,run_id,persona_id)
    screens=list({s['id']:s for s in [*(proto.screens_json if proto else []),*[e.screen_json for e in captured]]}.values())
    return {'run':run,'persona':persona,'screens':screens,'task':task.description if task else '', 'logs':rows,'source':source}

async def thread(session:AsyncSession,run_id:int,persona_id:int,lock=False):
    if lock:
        await session.execute(insert(InterviewThread).values(run_id=run_id,persona_id=persona_id).on_conflict_do_nothing(index_elements=['run_id','persona_id']))
    query=select(InterviewThread).where(InterviewThread.run_id==run_id,InterviewThread.persona_id==persona_id)
    if lock:query=query.with_for_update()
    return await session.scalar(query)

async def messages(session:AsyncSession,thread_id:int):
    rows=list(await session.scalars(select(InterviewMessage).where(InterviewMessage.thread_id==thread_id).order_by(InterviewMessage.id.desc()).limit(INTERVIEW_HISTORY_LIMIT)))
    return list(reversed(rows))

async def add_message(session:AsyncSession,thread_id:int,question:str,answer:str,mode:str,evidence:list):
    message=InterviewMessage(thread_id=thread_id,question=question,answer=answer,mode=mode,evidence_json=evidence)
    session.add(message);await session.commit();await session.refresh(message)
    return message