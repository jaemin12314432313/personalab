import httpx
import pytest

from app.core.config import settings
from app.services.figma import importer


def document():
    return {'document':{'id':'0:0','type':'DOCUMENT','children':[{'id':'0:1','type':'CANVAS','flowStartingPoints':[{'nodeId':'1:2'}],'children':[
        {'id':'1:1','type':'FRAME','name':'첫 화면','children':[
            {'id':'2:1','type':'TEXT','characters':'안녕하세요'},
            {'id':'2:2','type':'FRAME','name':'다음 버튼','children':[{'id':'2:3','type':'TEXT','characters':'다음'}], 'interactions':[{'trigger':{'type':'ON_CLICK'},'actions':[{'type':'NODE','navigation':'NAVIGATE','destinationId':'1:2'}]}]},
            {'id':'2:4','type':'TEXT','characters':'숨긴 정보','visible':False},
        ]},
        {'id':'1:2','type':'FRAME','name':'완료 화면','children':[{'id':'3:1','type':'TEXT','characters':'완료됐어요'}]},
    ]}]}}


@pytest.mark.parametrize('url',[
    'https://evil.example/design/ABC123/test',
    'https://www.figma.com.evil.example/design/ABC123/test',
    'https://www.figma.com@evil.example/design/ABC123/test',
    'http://www.figma.com/design/ABC123/test',
    'https://www.figma.com:9000/design/ABC123/test',
    'https://www.figma.com/design/ABC123/test?node-id=invalid',
])
def test_url_is_parsed_and_never_fetched_arbitrarily(url):
    with pytest.raises(importer.FigmaImportError):
        importer.parse_figma_url(url)


def test_convert_preserves_explicit_connections_and_selects_requested_start():
    screens,warnings=importer.convert_file(document(),'2:1')
    assert [s['label'] for s in screens] == ['첫 화면','완료 화면']
    assert screens[0]['elements'] == [{'text':'다음','to':'S02'}]
    assert '숨긴 정보' not in screens[0]['description']
    assert '이미지' in warnings[0]
    assert importer.convert_file(document())[0][0]['label']=='완료 화면'
    with pytest.raises(importer.FigmaImportError): importer.convert_file(document(),'99:99')


def test_unsupported_actions_and_omitted_destinations_are_not_invented():
    data=document();button=data['document']['children'][0]['children'][0]['children'][1]
    button['interactions'][0]['actions'][0]['navigation']='OVERLAY'
    screens,warnings=importer.convert_file(data,'1:1')
    assert screens[0]['elements']==[]
    assert any('생략' in text for text in warnings)
    button['interactions'][0]['actions'][0]['navigation']='NAVIGATE'
    button['interactions'][0]['actions'][0]['destinationId']='99:99'
    assert importer.convert_file(data,'1:1')[0][0]['elements']==[]


async def test_import_uses_fixed_official_host_and_server_token(monkeypatch):
    monkeypatch.setattr(settings,'figma_access_token','figma-test-token')
    original=httpx.AsyncClient
    calls=[]
    def respond(request):
        calls.append(request)
        assert request.url.host=='api.figma.com'
        assert request.headers['X-Figma-Token']=='figma-test-token'
        return httpx.Response(200,json=document())
    monkeypatch.setattr(importer.httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(respond),**kw))
    screens,_=await importer.import_file('https://www.figma.com/design/ABC123/test?node-id=1-1')
    assert len(screens)==2 and len(calls)==1


async def test_import_permission_error_never_echoes_upstream_body_or_key(monkeypatch):
    monkeypatch.setattr(settings,'figma_access_token','figma-secret')
    original=httpx.AsyncClient
    monkeypatch.setattr(importer.httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(lambda req:httpx.Response(403,text='figma-secret private body')),**kw))
    with pytest.raises(importer.FigmaImportError) as error:
        await importer.import_file('https://www.figma.com/file/ABC123/test')
    assert error.value.status==403
    assert 'figma-secret' not in str(error.value) and 'private body' not in str(error.value)


async def test_import_without_token_never_connects(monkeypatch):
    monkeypatch.setattr(settings,'figma_access_token','')
    with pytest.raises(importer.FigmaImportError) as error:
        await importer.import_file('https://www.figma.com/file/ABC123/test')
    assert error.value.status==503


async def test_import_retries_bounded_and_rejects_oversized_response(monkeypatch):
    monkeypatch.setattr(settings,'figma_access_token','figma-test-token')
    original=httpx.AsyncClient
    count=0
    def respond(request):
        nonlocal count
        count+=1
        return httpx.Response(503) if count<3 else httpx.Response(200,json=document())
    async def wait(seconds): pass
    monkeypatch.setattr(importer.asyncio,'sleep',wait)
    monkeypatch.setattr(importer.httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(respond),**kw))
    assert len((await importer.import_file('https://www.figma.com/design/ABC123/test'))[0])==2
    assert count==3
    monkeypatch.setattr(importer,'FIGMA_MAX_BYTES',10)
    with pytest.raises(importer.FigmaImportError,match='너무 큽니다'):
        await importer.import_file('https://www.figma.com/design/ABC123/test')