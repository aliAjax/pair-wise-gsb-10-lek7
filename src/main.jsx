import React,{useEffect,useMemo,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import'./styles.css';

/* ---------- 本机日期判断 ---------- */
const DAY=86400000;
const pad=n=>String(n).padStart(2,'0');
const fmt=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today=()=>{const d=new Date();d.setHours(0,0,0,0);return d;};
const parseDate=s=>{const[y,m,d]=(s||'').split('-').map(Number);return new Date(y||1970,(m||1)-1,d||1);};
const fromToday=off=>{const d=today();d.setDate(d.getDate()+off);return fmt(d);};
const addDays=(s,n)=>{const d=parseDate(s);d.setDate(d.getDate()+Number(n||0));return fmt(d);};
const daysUntil=s=>Math.round((parseDate(s)-today())/DAY);
// overdue: 已逾期 / soon: 三天内到期（含今天）/ ok: 周期内
const dueState=n=>{const d=daysUntil(n.nextDate);if(d<0)return'overdue';if(d<=3)return'soon';return'ok';};
const dueText=n=>{const d=daysUntil(n.nextDate);if(d<0)return`逾期 ${-d} 天`;if(d===0)return'今天到期';return`${d} 天后到期`;};

const ICON={router:'◉',switch:'▦',server:'▣',device:'▱'};
const HEALTH_TEXT={normal:'运行正常',abnormal:'运行异常',unknown:'待确认'};

/* ---------- 种子台账（首次打开演示用，日期按本机今天相对生成） ---------- */
const seed={nodes:[
  {id:'gw',name:'核心路由器',type:'router',x:470,y:220,ip:'10.0.0.1',nextDate:fromToday(-5),cycleDays:7,health:'unknown',records:[{date:fromToday(-12),result:'normal',note:'例行检查正常'}]},
  {id:'sw1',name:'交换机 A',type:'switch',x:250,y:370,ip:'10.0.1.1',nextDate:fromToday(2),cycleDays:7,health:'unknown',records:[{date:fromToday(-5),result:'normal',note:''}]},
  {id:'sw2',name:'交换机 B',type:'switch',x:690,y:370,ip:'10.0.2.1',nextDate:fromToday(9),cycleDays:14,health:'normal',records:[{date:fromToday(-5),result:'normal',note:'固件已升级'}]},
  {id:'web',name:'Web Server',type:'server',x:100,y:520,ip:'10.0.1.10',nextDate:fromToday(0),cycleDays:30,health:'unknown',records:[{date:fromToday(-30),result:'normal',note:''}]},
  {id:'db',name:'Database',type:'server',x:400,y:550,ip:'10.0.1.20',nextDate:fromToday(-12),cycleDays:7,health:'abnormal',records:[{date:fromToday(-19),result:'abnormal',note:'硬盘告警，待更换'}]},
  {id:'user',name:'办公终端',type:'device',x:820,y:530,ip:'10.0.2.22',nextDate:fromToday(5),cycleDays:30,health:'normal',records:[{date:fromToday(-25),result:'normal',note:''}]}
],edges:[['gw','sw1'],['gw','sw2'],['sw1','web'],['sw1','db'],['sw2','user']]};

/* 巡检记录与日期都只存本机 localStorage；兼容旧版拓扑数据 */
const load=()=>{
  let raw=null;
  try{raw=JSON.parse(localStorage.getItem('topology'));}catch{raw=null;}
  if(!raw||!Array.isArray(raw.nodes))return seed;
  return{...raw,
    nodes:raw.nodes.map(n=>({nextDate:fromToday(7),cycleDays:7,health:'unknown',records:[],...n})),
    edges:Array.isArray(raw.edges)?raw.edges:[]};
};

function App(){
  const[data,setData]=useState(load);
  const[selected,setSelected]=useState(()=>load()?.nodes?.[0]?.id||'gw');
  const[tool,setTool]=useState('select');
  const[notice,setNotice]=useState('');
  const[drag,setDrag]=useState(null);
  const[draft,setDraft]=useState(null); // 完成巡检的录入草稿
  const board=useRef();

  useEffect(()=>localStorage.setItem('topology',JSON.stringify(data)),[data]);
  useEffect(()=>{setDraft(null);},[selected]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),3200);return()=>clearTimeout(t);},[notice]);

  const node=data.nodes.find(n=>n.id===selected)||data.nodes[0];
  const stateOf=n=>n?dueState(n):'ok';

  const overdueNodes=useMemo(()=>data.nodes.filter(n=>dueState(n)==='overdue'),[data.nodes]);
  const soonNodes=useMemo(()=>data.nodes.filter(n=>dueState(n)==='soon'),[data.nodes]);
  const riskEdges=useMemo(()=>data.edges.filter(([a,b])=>{
    const n1=data.nodes.find(n=>n.id===a),n2=data.nodes.find(n=>n.id===b);
    return n1&&n2&&(dueState(n1)==='overdue'||dueState(n2)==='overdue');
  }),[data]);

  const updateNode=(k,v)=>setData(d=>({...d,nodes:d.nodes.map(n=>n.id===selected?{...n,[k]:v}:n)}));

  const addNode=(type='device',label='新设备')=>{
    const id='node'+Date.now()+Math.random().toString(36).slice(2,6);
    const n={id,name:label,type,x:460+Math.round(Math.random()*80),y:300+Math.round(Math.random()*60),ip:'192.168.0.10',
      nextDate:fromToday(7),cycleDays:7,health:'unknown',records:[]};
    setData(d=>({...d,nodes:[...d.nodes,n]}));
    setSelected(id);setTool('select');setNotice('已添加设备，请登记下次巡检日期与周期');
  };

  /* 经过逾期设备的连线禁止新建 */
  const connect=()=>{
    if(!node)return;
    if(dueState(node)==='overdue'){setNotice(`「${node.name}」巡检已逾期，须先完成本次巡检，不能从该设备新建连线`);return;}
    const other=(prompt('输入要连接的设备 ID（例如 sw1）')||'').trim();
    if(!other)return;
    const tgt=data.nodes.find(n=>n.id===other);
    if(!tgt){setNotice('未找到该设备 ID');return;}
    if(tgt.id===node.id){setNotice('不能与设备自身建立连线');return;}
    if(dueState(tgt)==='overdue'){setNotice(`「${tgt.name}」巡检已逾期，不能与该设备新建连线，请先完成巡检`);return;}
    if(data.edges.some(e=>(e[0]===node.id&&e[1]===other)||(e[1]===node.id&&e[0]===other))){setNotice('两设备之间已有连线');return;}
    setData(d=>({...d,edges:[...d.edges,[node.id,tgt.id]]}));
    setNotice('连接已创建');
  };

  const remove=()=>{
    if(!node)return;
    setData(d=>({...d,nodes:d.nodes.filter(n=>n.id!==node.id),edges:d.edges.filter(e=>!e.includes(node.id))}));
    setSelected(data.nodes.find(n=>n.id!==node.id)?.id);
    setNotice('设备及其巡检记录已删除');
  };

  const exportJson=()=>{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    a.download='inspection-ledger.json';a.click();
    setNotice('巡检台账 JSON 已导出');
  };

  const validate=()=>{
    const linked=new Set(data.edges.flat());
    const isolated=data.nodes.filter(n=>!linked.has(n.id));
    const parts=[];
    parts.push(isolated.length?`发现 ${isolated.length} 个孤立节点`:'拓扑检查通过：没有孤立节点');
    parts.push(`已逾期 ${overdueNodes.length} 台、三日内到期 ${soonNodes.length} 台、巡检风险连线 ${riskEdges.length} 条`);
    setNotice(parts.join('；'));
  };

  /* 逾期 / 三天内到期：禁止标记运行正常 */
  const markHealth=h=>{
    if(!node)return;
    if(h==='normal'&&dueState(node)!=='ok'){setNotice('该设备已逾期或三天内到期，须先完成本次巡检，才能标记运行正常');return;}
    updateNode('health',h);
    setNotice(h==='normal'?'已标记为运行正常':'已标记为运行异常');
  };

  /* 完成本次巡检：登记记录，按周期顺延下一次日期 */
  const finishInspection=()=>{
    if(!node||!draft)return;
    const rec={date:fmt(today()),result:draft.result,note:draft.note.trim()};
    const nextDate=addDays(node.nextDate,node.cycleDays);
    const d=daysUntil(nextDate);
    // 顺延之后仍逾期/即将到期（积压多次未检）时，正常状态仍需补检后才能生效
    const health=draft.result==='abnormal'?'abnormal':(d>3?'normal':'unknown');
    setData(dt=>({...dt,nodes:dt.nodes.map(n=>n.id===node.id
      ?{...n,nextDate,records:[rec,...(n.records||[])],health}
      :n)}));
    setDraft(null);
    setNotice(draft.result==='abnormal'
      ?`巡检完成（结果异常），下次巡检日期 ${nextDate}`
      :d>3?`巡检完成，设备运行正常，下次巡检 ${nextDate}`
      :`巡检完成，但仍有积压巡检，下次日期 ${nextDate}，请继续补检`);
  };

  const move=e=>{
    if(!drag)return;
    const r=board.current.getBoundingClientRect();
    setData(d=>({...d,nodes:d.nodes.map(n=>n.id===drag
      ?{...n,x:Math.max(35,e.clientX-r.left),y:Math.max(35,e.clientY-r.top)}
      :n)}));
  };

  const alertItems=[
    ...overdueNodes.map(n=>({n,cls:'overdue'})),
    ...soonNodes.map(n=>({n,cls:'soon'}))
  ];

  return <div className="app">
    <header>
      <div className="brand"><span className="brand-mark">⌁</span><div><strong>机房巡检台</strong><small>INSPECTION STATION</small></div></div>
      <div className="file"><span className={'dot '+(overdueNodes.length?'dot-red':'')}></span><div><strong>机房巡检台账</strong><small>本机存储 · 重新打开可续看</small></div></div>
      <div className="top-actions">
        <button onClick={validate}>✓ 检查</button>
        <button onClick={exportJson}>↓ 导出</button>
      </div>
    </header>
    <div className="toolbar">
      <div className="tool-group">
        <span>工具</span>
        <button className={tool==='select'?'on':''} onClick={()=>setTool('select')}>↖ 选择</button>
        <button className={tool==='connect'?'on':''} onClick={()=>{setTool('connect');connect();}}>⌁ 连接</button>
        <button onClick={()=>addNode()}>＋ 设备</button>
      </div>
      <div className="tool-group patrol-summary">
        <span className="ps overdue">已逾期 {overdueNodes.length}</span>
        <span className="ps soon">三日内到期 {soonNodes.length}</span>
        <span className="ps risk">风险连线 {riskEdges.length}</span>
      </div>
    </div>
    <div className="workspace">
      <aside className="inventory">
        <div className="section-title"><span>设备库</span><small>{data.nodes.length} 个节点</small></div>
        <div className="device-types">{[['router','路由器'],['switch','交换机'],['server','服务器'],['device','终端设备']].map(([t,l])=>
          <button onClick={()=>addNode(t,l)} key={t}><i className={t}>{ICON[t]}</i>{l}<span>＋</span></button>)}
        </div>
        <div className="section-title nodes-head"><span>图中节点</span><small>点击查看</small></div>
        <div className="node-list">{data.nodes.map(n=>{const st=dueState(n);return(
          <button className={selected===n.id?'sel':''} onClick={()=>setSelected(n.id)} key={n.id}>
            <i className={n.type}>{ICON[n.type]}</i>
            <span><strong>{n.name}</strong><small>{n.ip}</small></span>
            {st!=='ok'&&<small className={'due-mini '+st}>{dueText(n)}</small>}
            <b>›</b>
          </button>)})}
        </div>
      </aside>

      <section className="canvas-wrap">
        <div className="canvas" ref={board} onMouseMove={move} onMouseUp={()=>setDrag(null)}>
          {data.edges.map(([a,b],i)=>{
            const n1=data.nodes.find(n=>n.id===a),n2=data.nodes.find(n=>n.id===b);
            if(!n1||!n2)return null;
            const dx=n2.x-n1.x,dy=n2.y-n1.y,len=Math.hypot(dx,dy),ang=Math.atan2(dy,dx)*180/Math.PI;
            const risk=dueState(n1)==='overdue'||dueState(n2)==='overdue';
            return <React.Fragment key={i}>
              <div className={'edge'+(risk?' risk':'')} style={{left:n1.x,top:n1.y,width:len,transform:`rotate(${ang}deg)`}}><span></span></div>
              {risk&&<div className="edge-risk-tag" style={{left:(n1.x+n2.x)/2,top:(n1.y+n2.y)/2}}>巡检风险</div>}
            </React.Fragment>;
          })}
          {data.nodes.map(n=>{const st=dueState(n);return(
            <button className={'node '+n.type+' '+(st!=='ok'?'due-'+st:'')} style={{left:n.x-42,top:n.y-31}}
              onMouseDown={e=>{e.stopPropagation();setSelected(n.id);setDrag(n.id);}}
              onClick={()=>setSelected(n.id)} key={n.id}>
              <span className={'health-dot '+n.health} title={HEALTH_TEXT[n.health]}></span>
              <i>{ICON[n.type]}</i>
              <strong>{n.name}</strong>
              <small>{n.ip}</small>
              {st!=='ok'&&<em className={'due-ribbon '+st}>{dueText(n)}</em>}
            </button>)})}

          <div className="patrol-alert">
            <div className="pa-head"><span>巡检到期提示</span><small>本机今日 {fmt(today())}</small></div>
            {alertItems.length===0
              ?<div className="pa-empty">✓ 所有设备均在巡检周期内</div>
              :<div className="pa-list">{alertItems.map(({n,cls})=>
                <button className={'pa-item '+cls} key={cls+n.id} onClick={()=>setSelected(n.id)}>
                  <span><i className={n.type}>{ICON[n.type]}</i>{n.name}</span>
                  <small>{dueText(n)} · {n.nextDate}</small>
                </button>)}</div>}
          </div>

          <div className="legend">
            <span><i className="lg-overdue"></i>已逾期</span>
            <span><i className="lg-soon"></i>三日内到期</span>
            <span><i className="lg-risk"></i>巡检风险连线</span>
            <span><i className="lg-normal"></i>运行正常</span>
          </div>
        </div>
        <div className="canvas-footer">
          <span>拖动节点调整位置 · {data.edges.length} 条连接 · 巡检风险 {riskEdges.length} 条</span>
          <span>已逾期 {overdueNodes.length} · 三日内到期 {soonNodes.length} · 日期按本机判断</span>
        </div>
      </section>

      <aside className="inspector">
        <div className="section-title"><span>属性</span><small>{node?.type}</small></div>
        {node?<>
          <label>设备名称<input value={node.name} onChange={e=>updateNode('name',e.target.value)}/></label>
          <label>IP 地址<input value={node.ip} onChange={e=>updateNode('ip',e.target.value)}/></label>
          <label>设备类型
            <select value={node.type} onChange={e=>updateNode('type',e.target.value)}>
              <option value="router">路由器</option><option value="switch">交换机</option>
              <option value="server">服务器</option><option value="device">终端设备</option>
            </select>
          </label>

          <div className="patrol-block">
            <div className="section-title"><span>巡检台账</span><small>{node.cycleDays} 天/周期</small></div>
            <div className={'patrol-status st-'+stateOf(node)}>
              <span className={'status-badge '+stateOf(node)}></span>
              {stateOf(node)==='overdue'&&<>该设备{dueText(node)}，须立即巡检（计划 {node.nextDate}）</>}
              {stateOf(node)==='soon'&&<>巡检{dueText(node)}（计划 {node.nextDate}）</>}
              {stateOf(node)==='ok'&&<>巡检查在周期内，{dueText(node)}（{node.nextDate}）</>}
            </div>
            <label>下次巡检日期
              <input type="date" value={node.nextDate} onChange={e=>e.target.value&&updateNode('nextDate',e.target.value)}/>
            </label>
            <label>巡检周期（天）
              <input type="number" min="1" value={node.cycleDays}
                onChange={e=>updateNode('cycleDays',Math.max(1,parseInt(e.target.value,10)||1))}/>
              <span className="cycle-chips">{[7,30,90].map(c=>
                <button key={c} className={node.cycleDays===c?'on':''} onClick={()=>updateNode('cycleDays',c)}>{c} 天</button>)}</span>
            </label>

            <div className="health-row">
              <div className="health-head"><span>运行状态</span><strong className={'hl-'+node.health}>{HEALTH_TEXT[node.health]}</strong></div>
              <div className="health-btns">
                <button className={node.health==='normal'?'on-normal':''} disabled={stateOf(node)!=='ok'}
                  title={stateOf(node)!=='ok'?'已逾期或三天内到期，须先完成本次巡检':'标记为运行正常'}
                  onClick={()=>markHealth('normal')}>✓ 运行正常</button>
                <button className={node.health==='abnormal'?'on-abnormal':''} onClick={()=>markHealth('abnormal')}>! 运行异常</button>
              </div>
              {stateOf(node)!=='ok'&&<p className="health-hint">已逾期或三天内到期，完成本次巡检后才能标记运行正常</p>}
            </div>

            {!draft
              ?<button className="finish-btn" onClick={()=>setDraft({result:'normal',note:''})}>完成本次巡检（按周期顺延）</button>
              :<div className="finish-form">
                  <div className="ff-title">登记本次巡检 · {fmt(today())}</div>
                  <div className="result-switch">
                    <button className={draft.result==='normal'?'on-ok':''} onClick={()=>setDraft({...draft,result:'normal'})}>✓ 巡检正常</button>
                    <button className={draft.result==='abnormal'?'on-bad':''} onClick={()=>setDraft({...draft,result:'abnormal'})}>! 巡检异常</button>
                  </div>
                  <input placeholder="巡检备注（可空）" value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/>
                  <div className="ff-btns">
                    <button onClick={()=>setDraft(null)}>取消</button>
                    <button className="confirm" onClick={finishInspection}>确认完成，顺延至 {addDays(node.nextDate,node.cycleDays)}</button>
                  </div>
                </div>}

            <div className="records">
              <div className="section-title"><span>巡检记录</span><small>{node.records?.length||0} 条 · 存本机</small></div>
              {(node.records||[]).length===0
                ?<p className="records-empty">暂无巡检记录</p>
                :node.records.map((r,i)=>(
                  <div className="record" key={i}>
                    <div><span className="rec-date">{r.date}</span><span className={'badge-res '+r.result}>{r.result==='normal'?'正常':'异常'}</span></div>
                    {r.note&&<p>{r.note}</p>}
                  </div>))}
            </div>
          </div>

          <div className="inspector-actions">
            <button onClick={connect}>⌁ 添加连接</button>
            <button className="danger" onClick={remove}>删除设备</button>
          </div>
          <div className="connections">
            <div className="section-title"><span>连接</span><small>{data.edges.filter(e=>e.includes(node.id)).length} 条</small></div>
            {data.edges.filter(e=>e.includes(node.id)).map((e,i)=>{
              const other=data.nodes.find(n=>n.id===(e[0]===node.id?e[1]:e[0]));
              const risk=other&&dueState(other)==='overdue';
              return <div className={'connection'+(risk?' conn-risk':'')} key={i}>
                <span className={'mini '+other?.type}></span><strong>{other?.name}</strong>
                <small>{risk?'巡检风险':'在线'}</small>
              </div>;
            })}
          </div>
        </>:<p>选择一个设备</p>}
      </aside>
    </div>
    {notice&&<div className="toast">{notice}</div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
