from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Study,Product,Prototype,Task,Persona,Run,ActLog,LocalDemoStudy

async def create_demo(session:AsyncSession,user_id:int,screens:list,records:list):
    study=Study(user_id=user_id,name='로컬 연결 점검 · 가상 예시',status='done');session.add(study);await session.flush()
    session.add_all([LocalDemoStudy(study_id=study.id),Product(study_id=study.id,description='로컬 연결 점검\n직접 구성한 가상 입력으로 DB 저장과 결과·후속 질문을 확인합니다.',features_json=['로컬 연결 점검'],price=''),Prototype(study_id=study.id,figma_url=None,screens_json=screens,links_json=[{'from':s['id'],'text':e['text'],'to':e['to']} for s in screens for e in s['elements'] if e.get('to')]),Task(study_id=study.id,description='가입을 완료하고 홈으로 이동하세요.',goal_screen_id='LC03')])
    run=Run(study_id=study.id,mode='act',status='done',progress=1);session.add(run);await session.flush()
    for attributes,logs in records:
        persona=Persona(study_id=study.id,attributes_json=attributes);session.add(persona);await session.flush()
        session.add_all([ActLog(run_id=run.id,participant_type='ai',participant_id=persona.id,**row) for row in logs])
    await session.commit()
    return study.id,run.id