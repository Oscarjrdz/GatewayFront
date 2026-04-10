import { useState, useEffect, useRef } from 'react';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://gatewaywapp-production.up.railway.app';

function App() {
  const [isAuthorized, setIsAuthorized] = useState(localStorage.getItem('admin_access') === 'true');
  const [masterPassword, setMasterPassword] = useState('');

  const [instance, setInstance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Auth States
  const [inputId, setInputId] = useState('');
  const [inputToken, setInputToken] = useState('');

  // Dashboard States
  const [status, setStatus] = useState('loading');
  const [qrCode, setQrCode] = useState(null);
  const [phoneTo, setPhoneTo] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  // List of all instances in Backend
  const [allInstances, setAllInstances] = useState([]);
  const [apiTab, setApiTab] = useState('chat');
  
  const prevStatusRef = useRef('loading');

  useEffect(() => {
    // If we have an instance, poll the status every 4 seconds
    let interval;
    if (instance) {
      checkStatus();
      interval = setInterval(checkStatus, 4000);
    } else {
      fetchAllInstances();
    }
    return () => clearInterval(interval);
  }, [instance]);

  const fetchAllInstances = async () => {
    try {
      const res = await fetch(`${API_URL}/instances`);
      const data = await res.json();
      setAllInstances(data);
    } catch (e) { console.error('Error fetching list', e); }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} copiado al portapapeles`);
  };

  const handleCreateNew = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/instances`, { method: 'POST' });
      const data = await res.json();
      setInstance({ id: data.instance_id, token: data.token });
      showToast('Nueva instancia creada exitosamente');
    } catch (error) {
      showToast('Error al conectar con la API', 'error');
    }
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!inputId || !inputToken) return showToast('Completa ambos campos', 'error');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/${inputId}/status?token=${inputToken}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setInstance({ 
        id: inputId, 
        token: inputToken, 
        messages_sent: data.messages_sent || 0,
        messages_received: data.messages_received || 0,
        webhook_url: data.webhook_url || '',
        webhook_message_received: data.webhook_message_received || false,
        instance_name: data.instance_name || ''
      });
      setStatus(data.status);
      showToast('Acceso correcto');
    } catch (error) {
      showToast(error.message || 'Credenciales inválidas', 'error');
    }
    setLoading(false);
  };

  const checkStatus = async () => {
    if (!instance) return;
    try {
      const res = await fetch(`${API_URL}/${instance.id}/status?token=${instance.token}`);
      const data = await res.json();
      setStatus(data.status);
      
      setInstance(prev => prev ? ({
        ...prev,
        messages_sent: data.messages_sent || 0,
        messages_received: data.messages_received || 0
      }) : null);

      if (data.status === 'qr') {
        fetchQr();
      } else {
        setQrCode(null);
      }

      if (data.status === 'disconnected' && prevStatusRef.current !== 'disconnected') {
        showToast('Instancia desconectada', 'warning');
      }
      prevStatusRef.current = data.status;
    } catch (e) {
      console.error(e);
    }
  };

  const fetchQr = async () => {
    try {
      const res = await fetch(`${API_URL}/${instance.id}/qr?token=${instance.token}`);
      const data = await res.json();
      if (data.qr) setQrCode(data.qr);
    } catch (e) {}
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!phoneTo || !messageBody) return showToast('Llena el teléfono y el mensaje', 'warning');
    
    setSendingMsg(true);
    try {
      const res = await fetch(`${API_URL}/${instance.id}/messages/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: instance.token,
          to: phoneTo,
          body: messageBody
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      showToast('Mensaje enviado maravillosamente');
      setMessageBody('');
      checkStatus(); // Refresh counters
    } catch (error) {
      showToast(error.message, 'error');
    }
    setSendingMsg(false);
  };

  const saveWebhook = async () => {
    try {
      const res = await fetch(`${API_URL}/${instance.id}/settings/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: instance.token,
          webhook_url: instance.webhook_url || '',
          webhook_message_received: instance.webhook_message_received || false,
          instance_name: instance.instance_name || ''
        })
      });
      const data = await res.json();
      if (data.success) showToast('Webhook guardado exitosamente');
    } catch (err) {
      showToast('Error al guardar webhook', 'error');
    }
  };

  const deleteInstance = async () => {
    if(!window.confirm('¿Seguro que deseas eliminar esta instancia y desconectar su número permanentemente?')) return;
    try {
      const res = await fetch(`${API_URL}/${instance.id}/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: instance.token })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      showToast('Instancia eliminada');
      handleLogout();
      fetchAllInstances();
    } catch (err) {
      console.error('Delete failed:', err);
      showToast('Error al eliminar: ' + err.message, 'error');
    }
  };

  const handleReconnect = async () => {
    try {
      showToast('Intentando reconectar...', 'success');
      await fetch(`${API_URL}/${instance.id}/reconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: instance.token })
      });
      showToast('Reconexión solicitada al servidor');
      checkStatus();
    } catch (err) {
      showToast('Error al reconectar', 'error');
    }
  };

  const handleLogout = () => {
    setInstance(null);
    setStatus('loading');
    setQrCode(null);
    setInputId('');
    setInputToken('');
  };

  const handleCopyDocumentation = () => {
    const doc = `
WHATSAPP GATEWAY API REFERENCE

Base URL: ${API_URL}
Instancia Actual: ${instance?.id || 'instance123'}
Token: ${instance?.token || 'abc123token'}

=== MENSAJES SALIENTES (POST) ===

1. ENVIAR CHAT (Texto/Emojis)
POST /:instanceId/messages/chat
{
  "token": "TU_TOKEN",
  "to": "528110000000@c.us",
  "body": "¡Hola Mundo! 🚀"
}

2. ENVIAR IMAGEN
POST /:instanceId/messages/image
{
  "token": "TU_TOKEN",
  "to": "528110000000@c.us",
  "image": "https://url.com/foto.jpg",
  "caption": "Pie de foto opcional"
}

3. ENVIAR DOCUMENTO (PDF/ZIP/EXCEL)
POST /:instanceId/messages/document
{
  "token": "TU_TOKEN",
  "to": "528110000000@c.us",
  "document": "https://url.com/reporte.pdf",
  "filename": "Reporte.pdf"
}

4. ENVIAR AUDIO (Notas de Voz / PTT)
POST /:instanceId/messages/audio
{
  "token": "TU_TOKEN",
  "to": "528110000000@c.us",
  "audio": "https://url.com/audio.mp3",
  "ptt": true // True transforma a Nota de Voz nativa
}

5. ENVIAR STICKER
POST /:instanceId/messages/sticker
{
  "token": "TU_TOKEN",
  "to": "528110000000@c.us",
  "sticker": "https://url.com/sticker.webp" // URL o base64
}

6. ENVIAR UBICACION (Map Location)
POST /:instanceId/messages/location
{
  "token": "TU_TOKEN",
  "to": "528110000000@c.us",
  "lat": 25.6866,
  "lng": -100.3161,
  "name": "Sucursal Centro", // Opcional
  "address": "Av. Morelos" // Opcional
}

7. CONTROL DE PRESENCIA (Escribiendo/Grabando)
POST /:instanceId/presence
{
  "token": "TU_TOKEN",
  "to": "528110000000@c.us",
  "status": "composing" // available | composing | recording | paused
}

8. CONFIRMAR LECTURA (Palomitas Azules)
POST /:instanceId/messages/read
{
  "token": "TU_TOKEN",
  "to": "528110000000@c.us",
  "messageId": "3EB0BC..."
}

9. PUBLICAR ESTADO de WhatsApp (Story)
POST /:instanceId/stories

// Tipo TEXTO:
{
  "token": "TU_TOKEN",
  "type": "text",
  "text": "¡Promo de Pizzas hoy! 🍕",
  "color": "#6C63FF", // Opcional, color de fondo hex
  "font": 1          // Opcional, tipografía del 0 al 4
}

// Tipo IMAGEN:
{
  "token": "TU_TOKEN",
  "type": "image",
  "image": "https://url.com/promo.jpg", // URL o base64
  "caption": "Pie de foto opcional"
}

// Tipo VIDEO:
{
  "token": "TU_TOKEN",
  "type": "video",
  "video": "https://url.com/clip.mp4", // URL o base64
  "caption": "Descripción del video"
}

=== WEBHOOKS PARAMS (ENTRANTES) ===

Cuando un cliente escribe, tu servidor recibe un POST JSON con:
{
  "event_type": "message_received",
  "instanceId": "instance123",
  "data": {
    "pushName": "Oscar 🚀",
    "key": {
      "remoteJid": "5218110000000@s.whatsapp.net",
      "fromMe": false
    },
    "message": { "conversation": "Deseo pedir pizza" },
    "messageTimestamp": 1679091234
  }
}
* Extraer Texto:   data.message.conversation ó data.message.extendedTextMessage.text
* Extraer Teléfono: data.key.remoteJid (limpia el @s.whatsapp.net)
* Validar Cliente:  Ignorar evento si data.key.fromMe es true

=== HERRAMIENTAS DIRECTAS ===

1. FOTO DE PERFIL (GET)
GET /:instanceId/contacts/profile-picture?token=TU_TOKEN&to=+528110000000
Respuesta: { "profile_picture": "https://..." }

2. CREACION DE INSTANCIAS (SaaS POST)
POST /instances (Body Vacío)
Respuesta: { "instance_id": "...", "token": "..." }

3. METRICAS / STATUS (GET)
GET /:instanceId/status?token=TU_TOKEN
Respuesta: { "status": "authenticated", "messages_sent": 142, "messages_received": 1058 }

4. CODIGO QR BASE 64 (GET)
GET /:instanceId/qr?token=TU_TOKEN
Respuesta: { "qr": "data:image/png;base64,....." }

=== CANALES DE WHATSAPP (NEWSLETTER) ===

1. CREAR CANAL
POST /:instanceId/channels
{
  "token": "TU_TOKEN",
  "name": "Mi Canal de Noticias",
  "description": "Descripción opcional"
}
Respuesta: { "success": true, "channel": { "id": "120363xxx@newsletter", "invite": "https://whatsapp.com/channel/..." } }

2. ENVIAR MENSAJE AL CANAL
POST /:instanceId/channels/:channelId/messages
{
  "token": "TU_TOKEN",
  "type": "text",    // "text", "image", "video"
  "text": "¡Bienvenidos! 🚀"
}

3. ACTUALIZAR CANAL (nombre / descripción / foto)
PATCH /:instanceId/channels/:channelId
{
  "token": "TU_TOKEN",
  "name": "Nuevo Nombre",
  "description": "Nueva descripción",
  "picture": "https://url.com/logo.jpg"
}

4. OBTENER METADATA DEL CANAL
GET /:instanceId/channels/:channelId?token=TU_TOKEN

5. SEGUIR UN CANAL
POST /:instanceId/channels/:channelId/follow
{ "token": "TU_TOKEN" }

6. DEJAR DE SEGUIR UN CANAL
POST /:instanceId/channels/:channelId/unfollow
{ "token": "TU_TOKEN" }

7. ELIMINAR CANAL (solo propietario)
DELETE /:instanceId/channels/:channelId?token=TU_TOKEN

=== GRUPOS DE WHATSAPP ===

1. CREAR GRUPO
POST /:instanceId/groups
{
  "token": "TU_TOKEN",
  "name": "Equipo de Ventas Q1",
  "participants": ["528110000001@c.us", "528110000002@c.us"]
}
Respuesta: { "group": { "id": "120363xxx@g.us", ... } }

2. LISTAR TODOS MIS GRUPOS (GET)
GET /:instanceId/groups?token=TU_TOKEN

3. INFO DE UN GRUPO (GET)
GET /:instanceId/groups/:groupId?token=TU_TOKEN

4. GESTIONAR PARTICIPANTES
POST /:instanceId/groups/:groupId/participants
{
  "token": "TU_TOKEN",
  "action": "add",  // "add" | "remove" | "promote" | "demote"
  "participants": ["528110000003@c.us"]
}

5. EDITAR NOMBRE / DESCRIPCIÓN / FOTO
PATCH /:instanceId/groups/:groupId
{
  "token": "TU_TOKEN",
  "name": "Nuevo Nombre",
  "description": "Nueva descripción",
  "picture": "https://url.com/foto.jpg"
}

6. OBTENER LINK DE INVITACIÓN (GET)
GET /:instanceId/groups/:groupId/invite?token=TU_TOKEN
Respuesta: { "invite_link": "https://chat.whatsapp.com/XXXX" }

7. UNIRSE A GRUPO POR CÓDIGO
POST /:instanceId/groups/join
{ "token": "TU_TOKEN", "code": "XXXXXX" }

8. SALIR DEL GRUPO
POST /:instanceId/groups/:groupId/leave
{ "token": "TU_TOKEN" }

9. CONFIGURACIÓN DEL GRUPO
POST /:instanceId/groups/:groupId/settings
{
  "token": "TU_TOKEN",
  "setting": "announcement"  // "announcement" | "not_announcement" | "locked" | "unlocked"
}
`.trim();
    navigator.clipboard.writeText(doc);
    showToast('Documentación maestra copiada al portapapeles');
  };
  if (!isAuthorized) {
    return (
      <div className="app-container" style={{display:'flex', alignItems:'center', justifyContent:'center', minHeight:'80vh'}}>
        <div className="glass-card" style={{maxWidth: '450px', width: '100%', textAlign: 'center'}}>
          <div className="logo-icon" style={{margin: '0 auto 1.5rem auto', width:'60px', height:'60px'}}>
             <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color: 'white'}}>
               <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
             </svg>
          </div>
          <h2>Acceso Privado APi</h2>
          <p style={{marginBottom: '2rem', fontSize:'0.85rem'}}>Esta es una puerta de enlace privada de infraestructura corporativa. Identifícate para continuar.</p>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            if (masterPassword === '8116038195') { // Temporal password till Google auth
              localStorage.setItem('admin_access', 'true');
              setIsAuthorized(true);
            } else {
              showToast('Credenciales incorrectas', 'error');
            }
          }}>
            <div className="input-group">
              <input 
                type="password" 
                placeholder="Contraseña Maestra..." 
                value={masterPassword} 
                onChange={e => setMasterPassword(e.target.value)}
                autoFocus
                style={{textAlign: 'center', fontSize: '1.2rem', letterSpacing: '3px'}}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{marginTop: '1rem'}}>
              Desbloquear Sistema
            </button>
            <p style={{marginTop: '1.5rem', fontSize:'0.75rem', opacity: 0.5}}>Protected Area • Encriptación End-to-End</p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <div className="logo-container">
          <div className="logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color: 'white'}}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
          </div>
          <div className="logo-text">
            <h1>Gateway</h1>
            <span>WhatsApp Infrastructure API</span>
          </div>
        </div>
        {instance && (
          <button className="btn btn-secondary" onClick={handleLogout} style={{width: 'auto'}}>
            Cerrar Sesión
          </button>
        )}
      </header>

      {!instance ? (
        <div style={{display: 'flex', flexDirection: 'column', gap: '2rem'}}>
          <div className="auth-grid">
            <div className="glass-card">
              <h2>Crear nueva instancia</h2>
              <p style={{marginBottom: '2rem'}}>Genera un nuevo entorno aislado para enlazar un número de WhatsApp. Obtendrás un InstanceID y Token exclusivos.</p>
              <button className="btn btn-primary" onClick={handleCreateNew} disabled={loading}>
                {loading ? <div className="loader"></div> : 'Generar Instancia Automática'}
              </button>
            </div>

            <div className="glass-card">
              <h2>Acceder a mi APi existente</h2>
              <p style={{marginBottom: '1.5rem'}}>Ingresa con tus credenciales de Gateway previamente generadas.</p>
              <form onSubmit={handleLogin} autoComplete="off">
                <div className="input-group">
                  <label>Instance ID</label>
                  <input 
                    type="text" 
                    placeholder="ej. instance123456" 
                    value={inputId} 
                    onChange={e => setInputId(e.target.value)}
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                  />
                </div>
                <div className="input-group">
                  <label>Token de Seguridad</label>
                  <input 
                    type="password" 
                    placeholder="*****************" 
                    value={inputToken} 
                    onChange={e => setInputToken(e.target.value)}
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-form-type="other"
                  />
                </div>
                <button type="submit" className="btn btn-secondary" disabled={loading}>
                   {loading ? <div className="loader" style={{borderColor: 'rgba(255,255,255,0.4)', borderTopColor: 'white'}}></div> : 'Ingresar al Dashboard'}
                </button>
              </form>
            </div>
          </div>

          <div className="glass-card" style={{margin: '0 auto', width: '100%'}}>
            <h2 style={{borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem'}}>Tus Instancias Activas (Master Dashboard)</h2>
            {allInstances.length === 0 ? (
              <p>No se han encontrado instancias en tu servidor de Railway.</p>
            ) : (
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem'}}>
                {allInstances.map((inst) => (
                  <div key={inst.instance_id} className="copy-field" style={{flexDirection: 'column', alignItems: 'flex-start', padding: '1.25rem', cursor: 'pointer', border: '1px solid var(--border-color)', position: 'relative'}} onClick={() => {
                      setInputId(inst.instance_id.replace('instance', ''));
                      setInputToken(inst.token);
                      showToast('Credenciales autollenadas. Haz click en Ingresar');
                  }}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '0.5rem', gap: '0.5rem'}}>
                      <strong style={{color: 'var(--brand-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '1.05rem'}} title={inst.instance_name || inst.instance_id}>
                        {inst.instance_name || inst.instance_id}
                      </strong>
                      <span className="status-badge" style={{fontSize: '0.6rem', padding: '4px 8px', background: inst.status === 'authenticated' ? 'var(--success)' : 'var(--error)', color: 'white', borderRadius: '4px', whiteSpace: 'nowrap'}}>{inst.status}</span>
                    </div>
                    {inst.instance_name && (
                      <code style={{fontSize: '0.7rem', color: 'gray', marginBottom: '0.25rem', display: 'block'}}>ID: {inst.instance_id}</code>
                    )}
                    <code style={{fontSize: '0.75rem', marginBottom: '0.5rem', display: 'block'}}>Token: {inst.token.substring(0,8)}...</code>
                    <div style={{display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'gray'}}>
                      <span>📤 {inst.messages_sent || 0}</span>
                      <span>📥 {inst.messages_received || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-secondary" style={{marginTop: '1rem'}} onClick={fetchAllInstances}>Recargar Lista</button>
          </div>
        </div>
      ) : (
        <div className="dashboard-grid">
          {/* Sidebar */}
          <div className="glass-card" style={{display: 'flex', flexDirection: 'column'}}>
            <div className={`status-${status}`} style={{marginBottom: '2rem'}}>
              <h3 style={{fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem', letterSpacing: '1px'}}>Estado del Sistema</h3>
              <div className="status-badge">
                <div className="status-dot"></div>
                {status === 'loading' ? 'CARGANDO...' : status === 'qr' ? 'EN ESPERA DE QR' : status === 'authenticated' ? 'CONECTADO Y LISTO' : 'DESCONECTADO'}
              </div>
            </div>

            <div style={{marginBottom: '2rem'}}>
              <h3 style={{fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '1rem', letterSpacing: '1px'}}>Métricas</h3>
              <div style={{display: 'flex', gap: '1rem'}}>
                <div style={{background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', flex: '1', textAlign: 'center'}}>
                  <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)'}}>{instance.messages_sent || 0}</div>
                  <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>Enviados</div>
                </div>
                <div style={{background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', flex: '1', textAlign: 'center'}}>
                  <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)'}}>{instance.messages_received || 0}</div>
                  <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>Recibidos</div>
                </div>
              </div>
            </div>

            <div style={{marginBottom: '2rem'}}>
              <h3 style={{fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '1rem', letterSpacing: '1px'}}>Tus Credenciales APi</h3>
              
              {instance.instance_name && (
                <div style={{color: 'var(--brand-color)', fontWeight: 'bold', marginBottom: '0.5rem'}}>
                  {instance.instance_name}
                </div>
              )}

              <div className="copy-field">
                <code title={instance.id}>{instance.id}</code>
                <button 
                  onClick={() => copyToClipboard(instance.id, 'Instance ID')}
                  style={{background: 'transparent', border:'none', color:'var(--brand-color)', cursor:'pointer', padding:'2px'}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
              </div>

              <div className="copy-field">
                <code title={instance.token}>••••••••••••••••</code>
                <button 
                  onClick={() => copyToClipboard(instance.token, 'Token')}
                  style={{background: 'transparent', border:'none', color:'var(--brand-color)', cursor:'pointer', padding:'2px'}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
              </div>
            </div>
            
            {(status === 'qr' || status === 'loading') && (
              <div className="qr-container">
                {qrCode ? (
                  <>
                    <img src={qrCode} alt="WhatsApp QR Code" />
                    <p style={{textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem'}}>Abre WhatsApp en tu celular y escanea para vincular.</p>
                  </>
                ) : (
                  <div className="loader" style={{width: '40px', height: '40px', borderTopColor: 'var(--brand-color)'}}></div>
                )}
              </div>
            )}
            
            {status === 'authenticated' && (
              <div className="qr-container" style={{background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)'}}>
                 <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginBottom: '1rem'}}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                 <p style={{color: 'var(--success)', fontWeight:'600', textAlign:'center'}}>WhatsApp Vinculado</p>
                 <p style={{color: 'var(--text-primary)', fontSize:'0.75rem', textAlign:'center', marginTop:'8px'}}>Tu APi está lista para enviar y recibir mensajes a través de webhooks.</p>
              </div>
            )}
            
            {status === 'disconnected' && (
              <button 
                onClick={handleReconnect} 
                className="btn" 
                style={{
                  background: 'var(--primary-color, rgb(59, 130, 246))', 
                  color: 'white', 
                  marginTop: 'auto', 
                  marginBottom: '10px',
                  paddingTop:'0.75rem', 
                  paddingBottom:'0.75rem'
                }}
              >
                Volver a Conectar (Re-Connect)
              </button>
            )}

            <button onClick={deleteInstance} className="btn" style={{background: 'transparent', border: '1px solid var(--error)', color: 'var(--error)', marginTop: status === 'disconnected' ? '0' : 'auto', paddingTop:'0.75rem', paddingBottom:'0.75rem'}}>Eliminar Instancia</button>

          </div>

          {/* Main Area */}
          <div style={{display: 'flex', flexDirection: 'column', gap: '2rem'}}>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start'}} className="cards-grid-half">
              <div className="glass-card">
                <h2 style={{borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem'}}>Petición APi de Prueba</h2>
              
              <form onSubmit={handleSendMessage}>
                <div className="input-group">
                  <label>Número de WhatsApp Destino (incluye código de país)</label>
                  <input 
                    type="text" 
                    placeholder="ej. +528114445555" 
                    value={phoneTo} 
                    onChange={e => setPhoneTo(e.target.value)}
                    disabled={status !== 'authenticated'}
                  />
                </div>

                <div className="input-group">
                  <label>Mensaje Body (Texto o JSON stringificado)</label>
                  <textarea 
                    rows="4"
                    placeholder="Escribe tu mensaje aquí..." 
                    value={messageBody} 
                    onChange={e => setMessageBody(e.target.value)}
                    disabled={status !== 'authenticated'}
                    style={{resize: 'vertical'}}
                  />
                </div>

                <button 
                  type="submit" 
                  className={`btn ${status === 'authenticated' ? 'btn-primary' : 'btn-secondary'}`} 
                  disabled={status !== 'authenticated' || sendingMsg}
                  style={{maxWidth: '250px'}}
                >
                  {sendingMsg ? (
                    <div className="loader" style={{borderColor: 'rgba(255,255,255,0.4)', borderTopColor: 'white'}}></div>
                  ) : (
                    <>
                      <span>Enviar POST Request</span>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </>
                  )}
                </button>
              </form>
            </div>

              <div className="glass-card">
                <h2 style={{borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem'}}>Ajustes de la Instancia</h2>
              
              <div className="input-group">
                <label>Nombre de la Instancia (Opcional)</label>
                <input 
                  type="text" 
                  placeholder="ej. Soporte Tienda Principal" 
                  value={instance?.instance_name || ''} 
                  onChange={e => setInstance({...instance, instance_name: e.target.value})}
                />
              </div>

              <div className="input-group">
                <label>Webhook URL (para recibir eventos POST desde WhatsApp)</label>
                <input 
                  type="url" 
                  placeholder="https://tudominio.com/webhook" 
                  value={instance?.webhook_url || ''} 
                  onChange={e => setInstance({...instance, webhook_url: e.target.value})}
                />
              </div>

              <div className="input-group" style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
                <input 
                  type="checkbox" 
                  id="webhook_msgs"
                  checked={instance?.webhook_message_received || false} 
                  onChange={e => setInstance({...instance, webhook_message_received: e.target.checked})}
                  style={{width: 'auto', transform: 'scale(1.2)'}}
                />
                <label htmlFor="webhook_msgs" style={{marginBottom: 0, cursor: 'pointer'}}>
                  Llamar Webhook cuando recibas un mensaje 📥
                </label>
              </div>

              <button className="btn btn-secondary" onClick={saveWebhook} style={{maxWidth: '200px'}}>Guardar Ajustes</button>
            </div>
            </div>

            <div className="glass-card" style={{border: '1px solid var(--brand-color)'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem'}}>
                <h2 style={{color:'var(--brand-color)', margin: 0}}>🚀 Referencia APi & Webhooks</h2>
                <button className="btn btn-secondary" onClick={handleCopyDocumentation} style={{width: 'auto', fontSize: '0.8rem', padding: '0.5rem 1rem', display: 'flex', gap: '8px', alignItems: 'center'}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  Copiar Todo
                </button>
              </div>
              <p style={{marginBottom: '1rem', fontSize: '0.85rem'}}>Documentación completa para construir tus integradores usando esta puerta de enlace. Selecciona un proceso:</p>
              
              <div style={{display: 'grid', gridTemplateColumns: '270px minmax(0, 1fr)', gap: '1.5rem', marginTop: '1rem'}} className="api-section">
                
                {/* Menú Lateral Estilo Ultramsg */}
                <div style={{background: 'rgba(0,0,0,0.2)', padding:'1rem', borderRadius: '12px'}}>
                  <h4 style={{fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem'}}>Mensajes (Salientes)</h4>
                  <div className="api-menu" style={{marginTop: 0, marginBottom: '1.5rem'}}>
                    <div className="api-menu-item" onClick={() => setApiTab('chat')} style={{background: apiTab === 'chat' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge post">POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>CHAT</span>
                    </div>
                    <div className="api-menu-item" onClick={() => setApiTab('image')} style={{background: apiTab === 'image' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge post">POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>IMAGE</span>
                    </div>
                    <div className="api-menu-item" onClick={() => setApiTab('document')} style={{background: apiTab === 'document' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge post">POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>DOCUMENT</span>
                    </div>
                    <div className="api-menu-item" onClick={() => setApiTab('audio')} style={{background: apiTab === 'audio' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge post">POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>AUDIO</span>
                    </div>
                    <div className="api-menu-item" onClick={() => setApiTab('sticker')} style={{background: apiTab === 'sticker' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge post">POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>STICKER</span>
                    </div>
                    <div className="api-menu-item" onClick={() => setApiTab('location')} style={{background: apiTab === 'location' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge post">POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>LOCATION</span>
                    </div>
                    <div className="api-menu-item" onClick={() => setApiTab('presence')} style={{background: apiTab === 'presence' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge post" style={{background: '#d97706'}}>POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>PRESENCIA</span>
                    </div>
                    <div className="api-menu-item" onClick={() => setApiTab('read')} style={{background: apiTab === 'read' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge post" style={{background: '#1d4ed8'}}>POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>LEER (AZULES)</span>
                    </div>
                    <div className="api-menu-item" onClick={() => setApiTab('story')} style={{background: apiTab === 'story' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge post" style={{background: '#db2777'}}>POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>STORY (ESTADO)</span>
                    </div>
                  </div>

                  <h4 style={{fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem'}}>Canales (Newsletter)</h4>
                  <div className="api-menu" style={{marginTop: 0, marginBottom: '1.5rem'}}>
                    <div className="api-menu-item" onClick={() => setApiTab('channel_create')} style={{background: apiTab === 'channel_create' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge post" style={{background: '#0ea5e9'}}>POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>CREAR CANAL</span>
                    </div>
                    <div className="api-menu-item" onClick={() => setApiTab('channel_send')} style={{background: apiTab === 'channel_send' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge post" style={{background: '#0ea5e9'}}>POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>ENVIAR AL CANAL</span>
                    </div>
                    <div className="api-menu-item" onClick={() => setApiTab('channel_manage')} style={{background: apiTab === 'channel_manage' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge get" style={{background: '#0ea5e9'}}>PATCH</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>ACTUALIZAR CANAL</span>
                    </div>
                  </div>

                  <h4 style={{fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem'}}>Grupos</h4>
                   <div className="api-menu" style={{marginTop: 0, marginBottom: '1.5rem'}}>
                     <div className="api-menu-item" onClick={() => setApiTab('group_create')} style={{background: apiTab === 'group_create' ? 'rgba(255,255,255,0.05)' : ''}}>
                        <span className="api-badge post" style={{background: '#16a34a'}}>POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>CREAR GRUPO</span>
                     </div>
                     <div className="api-menu-item" onClick={() => setApiTab('group_participants')} style={{background: apiTab === 'group_participants' ? 'rgba(255,255,255,0.05)' : ''}}>
                        <span className="api-badge post" style={{background: '#16a34a'}}>POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>PARTICIPANTES</span>
                     </div>
                     <div className="api-menu-item" onClick={() => setApiTab('group_manage')} style={{background: apiTab === 'group_manage' ? 'rgba(255,255,255,0.05)' : ''}}>
                        <span className="api-badge get" style={{background: '#16a34a'}}>PATCH</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>EDITAR GRUPO</span>
                     </div>
                   </div>

                   <h4 style={{fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem'}}>Difusión / Broadcast</h4>
                   <div className="api-menu" style={{marginTop: 0, marginBottom: '1.5rem'}}>
                     <div className="api-menu-item" onClick={() => setApiTab('broadcast')} style={{background: apiTab === 'broadcast' ? 'rgba(255,255,255,0.05)' : ''}}>
                        <span className="api-badge post" style={{background: '#ea580c'}}>POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>DIFUSIÓN MASIVA</span>
                     </div>
                   </div>

                   <h4 style={{fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem'}}>Contactos & Misc</h4>
                   <div className="api-menu" style={{marginTop: 0, marginBottom: '1.5rem'}}>
                     <div className="api-menu-item" onClick={() => setApiTab('contacts')} style={{background: apiTab === 'contacts' ? 'rgba(255,255,255,0.05)' : ''}}>
                        <span className="api-badge post">POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>CONTACTOS</span>
                     </div>
                     <div className="api-menu-item" onClick={() => setApiTab('reactions')} style={{background: apiTab === 'reactions' ? 'rgba(255,255,255,0.05)' : ''}}>
                        <span className="api-badge post">POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>REACCIONES</span>
                     </div>
                     <div className="api-menu-item" onClick={() => setApiTab('labels')} style={{background: apiTab === 'labels' ? 'rgba(255,255,255,0.05)' : ''}}>
                        <span className="api-badge post">POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>ETIQUETAS</span>
                     </div>
                   </div>

                  <h4 style={{fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem'}}>Webhooks (Entrantes)</h4>
                  <div className="api-menu" style={{marginTop: 0, marginBottom: '1.5rem'}}>
                    <div className="api-menu-item" onClick={() => setApiTab('webhook_message')} style={{background: apiTab === 'webhook_message' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge webhook">EVENT</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>RECIBIR MSJS</span>
                    </div>
                    <div className="api-menu-item" onClick={() => setApiTab('webhook_params')} style={{background: apiTab === 'webhook_params' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge get" style={{background: '#d97706'}}>INFO</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>PARÁMETROS UTILES</span>
                    </div>
                  </div>

                  <h4 style={{fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem'}}>Herramientas</h4>
                  <div className="api-menu" style={{marginTop: 0}}>
                    <div className="api-menu-item" onClick={() => setApiTab('profile_pic')} style={{background: apiTab === 'profile_pic' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge get">GET</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>FOTO PERFIL</span>
                    </div>
                    <div className="api-menu-item" onClick={() => setApiTab('create_instance')} style={{background: apiTab === 'create_instance' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge post">POST</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>CREAR</span>
                    </div>
                    <div className="api-menu-item" onClick={() => setApiTab('status')} style={{background: apiTab === 'status' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge get">GET</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>STATUS</span>
                    </div>
                    <div className="api-menu-item" onClick={() => setApiTab('qr')} style={{background: apiTab === 'qr' ? 'rgba(255,255,255,0.05)' : ''}}>
                       <span className="api-badge get">GET</span> <span style={{fontSize:'0.85rem', fontWeight:'500'}}>QR CODE</span>
                    </div>
                  </div>
                </div>

                {/* Contenido / Code Snippets */}
                <div>
                  {apiTab === 'audio' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Enviar Notas de Voz (Audios)</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Envía archivos <code>.mp3</code>, <code>.mp4</code> o <code>.ogg</code> pasando su URL con el parámetro <code>audio</code>. Si envías el flag especial <code>ptt: true</code>, el usuario no verá un "reproductor de música", sino que la burbuja se verá y reproducirá como una <strong>Nota de Voz natural de WhatsApp</strong> (Push To Talk).</p>
                      <div className="api-code-panel">
<pre>{`const response = await axios.post('${API_URL}/${instance.id}/messages/audio', {
  token: '${instance.token}',
  to: '528110000000@c.us',
  audio: 'https://ejemplo.com/bienvenida.mp3',
  ptt: true
});`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'sticker' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Enviar Sticker</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Envía un sticker pasando una URL pública apuntando a un archivo <code>.webp</code> o bien, el contenido del <code>.webp</code> codificado en base64 en la propiedad <code>sticker</code>.</p>
                      <div className="api-code-panel">
<pre>{`const response = await axios.post('${API_URL}/${instance.id}/messages/sticker', {
  token: '${instance.token}',
  to: '528110000000@c.us',
  sticker: 'https://ejemplo.com/sticker.webp'
});`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'location' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Enviar Ubicación (GPS)</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Envía un mapa interactivo con un PIN de latitud y longitud. Opcionalmente puedes agregar nombre y dirección (address) del lugar.</p>
                      <div className="api-code-panel">
<pre>{`const response = await axios.post('${API_URL}/${instance.id}/messages/location', {
  token: '${instance.token}',
  to: '528110000000@c.us',
  lat: 25.6866,
  lng: -100.3161,
  name: 'Macroplaza', // Opcional
  address: 'Monterrey, N.L.' // Opcional
});`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'presence' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Fingir Actividad Intermitente (Humanizar el Bot)</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>El estado no es un mensaje. Apoya psicológicamente a que parezca una persona real mostrando "Escribiendo..." (<code>composing</code>), "Grabando audio..." (<code>recording</code>) o "En línea" (<code>available</code>). Mándalo un par de segundos <strong>antes</strong> de enviar tu mensaje real de texto.</p>
                      <div className="api-code-panel">
<pre>{`// Mostrar "Escribiendo..." en el chat del usuario
const response = await axios.post('${API_URL}/${instance.id}/presence', {
  token: '${instance.token}',
  to: '528110000000@c.us',
  status: 'composing' // opciones: 'available', 'composing', 'recording', 'paused'
});`}</pre>
                      </div>
                    </>
                  )}
                  {apiTab === 'read' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Confirmar Lectura (Palomitas Azules)</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Envía una señal lógica al remitente para que sus palomitas se pinten de azul indicando que tu servidor procesó con éxito su webhook. Usa el id original del mensaje recibido.</p>
                      <div className="api-code-panel">
<pre>{`// Encender Palomitas Azules
const response = await axios.post('${API_URL}/${instance.id}/messages/read', {
  token: '${instance.token}',
  to: '528110000000@c.us',
  messageId: '3EB0BC...' // ID extraído del Webhook Payload entrante
});`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'story' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Publicar WhatsApp Status (Stories)</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Soporta Texto con color de fondo dinámico, Fotografías o Videos cortos. Opcionalmente puedes mandar el Array <code>contacts</code> para restringir quién lo puede ver, sino será público.</p>
                      <div className="api-code-panel">
<pre>{`// Publicar una Historia / Estado
const response = await axios.post('${API_URL}/${instance.id}/stories', {
  token: '${instance.token}',
  type: 'text', // Opciones: 'text', 'image', 'video'
  text: '¡Llegaron las nuevas pizzas!🍕',
  color: '#FF5733', // (Opcional) Fondo en Hexadecimal
  font: 1 // (Opcional) Tipografía del 0 al 4
});`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'channel_create' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Crear Canal de WhatsApp</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Genera un nuevo Canal (Newsletter) de WhatsApp. El canal pertenece al número vinculado en esta instancia. Recibirás el JID del canal para usarlo en los demás endpoints.</p>
                      <div className="api-code-panel">
<pre>{`// 1. Crear el Canal
const response = await axios.post('${API_URL}/${instance.id}/channels', {
  token: '${instance.token}',
  name: 'Mi Canal de Noticias',
  description: 'Aquí publicamos las últimas noticias 📰' // Opcional
});

// Resultado: Guarda el channel.id para usarlo después
{
  "success": true,
  "channel": {
    "id": "120363xxxxxx@newsletter",
    "name": "Mi Canal de Noticias",
    "description": "...",
    "invite": "https://whatsapp.com/channel/...",
    "subscribers": 0
  }
}`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'channel_send' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Enviar Mensaje a un Canal</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Publica texto, imagen o video en tu canal. El <code>channelId</code> es el JID que obtuviste al crearlo (termina en <code>@newsletter</code>).</p>
                      <div className="api-code-panel">
<pre>{`// Publicar texto en el canal
const response = await axios.post(
  '${API_URL}/${instance.id}/channels/120363xxxxxx@newsletter/messages',
  {
    token: '${instance.token}',
    type: 'text', // 'text', 'image', 'video'
    text: '¡Bienvenidos al canal! 🚀'
  }
);

// Con imagen:
{
  token: '${instance.token}',
  type: 'image',
  image: 'https://ejemplo.com/banner.jpg',
  caption: 'Texto descriptivo opcional'
}`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'channel_manage' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Gestionar el Canal (Actualizar / Eliminar)</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Actualiza el nombre, descripción o foto del canal. También puedes consultarlo, seguirlo o eliminarlo.</p>
                      <div className="api-code-panel">
<pre>{`// Actualizar datos del canal
await axios.patch(
  '${API_URL}/${instance.id}/channels/120363xxxxxx@newsletter?token=${instance.token}',
  {
    token: '${instance.token}',
    name: 'Nuevo Nombre', // Opcional
    description: 'Nueva descripción', // Opcional
    picture: 'https://url.com/logo.jpg' // Opcional, URL o base64
  }
);

// Obtener metadata del canal (GET)
await axios.get(
  '${API_URL}/${instance.id}/channels/120363xxxxxx@newsletter?token=${instance.token}'
);

// Seguir un canal externo
await axios.post('${API_URL}/${instance.id}/channels/120363xxxxxx@newsletter/follow', {
  token: '${instance.token}'
});

// Eliminar el canal (solo propietario)
await axios.delete(
  '${API_URL}/${instance.id}/channels/120363xxxxxx@newsletter?token=${instance.token}'
);`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'group_create' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Crear Grupo de WhatsApp</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Crea un grupo con nombre y participantes. Todos reciben la invitación automáticamente. El campo <code>participants</code> acepta números en formato <code>52811@c.us</code>.</p>
                      <div className="api-code-panel">
<pre>{`// Crear grupo nuevo
const res = await axios.post('${API_URL}/${instance.id}/groups', {
  token: '${instance.token}',
  name: 'Equipo de Ventas Q1',
  participants: ['528110000001@c.us', '528110000002@c.us']
});
// { "success": true, "group": { "id": "120363xxx@g.us", ... } }

// Listar todos los grupos (GET)
const todos = await axios.get(
  '${API_URL}/${instance.id}/groups?token=${instance.token}'
);

// Info de un grupo específico (GET)
const info = await axios.get(
  '${API_URL}/${instance.id}/groups/120363xxx@g.us?token=${instance.token}'
);

// Obtener link de invitación (GET)
const link = await axios.get(
  '${API_URL}/${instance.id}/groups/120363xxx@g.us/invite?token=${instance.token}'
);
// { "invite_link": "https://chat.whatsapp.com/XXXX" }

// Unirse a grupo por código
await axios.post('${API_URL}/${instance.id}/groups/join', {
  token: '${instance.token}',
  code: 'XXXXXX'
});

// Salir del grupo
await axios.post('${API_URL}/${instance.id}/groups/120363xxx@g.us/leave', {
  token: '${instance.token}'
});`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'group_participants' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Gestionar Participantes del Grupo</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Agrega, elimina, promueve o degrada miembros con el campo <code>action</code>.</p>
                      <div className="api-code-panel">
<pre>{`// action: 'add' | 'remove' | 'promote' | 'demote'
await axios.post(
  '${API_URL}/${instance.id}/groups/120363xxx@g.us/participants',
  {
    token: '${instance.token}',
    action: 'add',
    participants: ['528110000003@c.us']
  }
);

// Bloquearlo a solo admins pueden enviar mensajes
await axios.post(
  '${API_URL}/${instance.id}/groups/120363xxx@g.us/settings',
  {
    token: '${instance.token}',
    setting: 'announcement' // 'announcement'|'not_announcement'|'locked'|'unlocked'
  }
);`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'group_manage' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Editar Nombre, Descripción y Foto</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Actualiza el nombre, descripción o foto. Solo los campos enviados se modifican.</p>
                      <div className="api-code-panel">
<pre>{`await axios.patch(
  '${API_URL}/${instance.id}/groups/120363xxx@g.us',
  {
    token: '${instance.token}',
    name: 'Nuevo Nombre',               // Opcional
    description: 'Nueva descripción',  // Opcional
    picture: 'https://url.com/foto.jpg' // Opcional
  }
);

// Resetear enlace de invitación
await axios.post(
  '${API_URL}/${instance.id}/groups/120363xxx@g.us/invite/revoke',
  { token: '${instance.token}' }
);
// { "new_invite_link": "https://chat.whatsapp.com/NUEVO" }`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'broadcast' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Difusión Masiva (Lista de Difusión)</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Envía el mismo mensaje a múltiples números como mensajes <strong>individuales</strong> (no grupo). Cada uno lo recibe en su chat privado con tu número. Incluye un delay de 300ms entre envíos para evitar bloqueos.</p>
                      <div className="api-code-panel">
<pre>{`const res = await axios.post('${API_URL}/${instance.id}/broadcast', {
  token: '${instance.token}',
  recipients: [
    '528110000001@c.us',
    '528110000002@c.us',
    '528110000003@c.us'
  ],
  type: 'text',   // 'text' | 'image' | 'video' | 'audio' | 'document'
  body: '¡Hola! Promo especial hoy 🔥'
});

// Resultado detallado por número:
{
  "success": true,
  "sent": 3,
  "total": 3,
  "results": [
    { "to": "528110000001@c.us", "status": "sent", "id": "3EB0..." },
    { "to": "528110000002@c.us", "status": "sent", "id": "3EB1..." },
    { "to": "528110000003@c.us", "status": "failed", "error": "Number not on WhatsApp" }
  ]
}`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'contacts' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Crear / Editar / Eliminar / Bloquear</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Guarda, edita, elimina o bloquea un contacto directamente en la agenda del número vinculado. útil para evitar recibir más mensajes de ese número o para guardarlo.</p>
                      <div className="api-code-panel">
<pre>{`// Agregar o editar contacto
await axios.post('${API_URL}/${instance.id}/contacts', {
  token: '${instance.token}',
  number: '528110000001@c.us',
  firstName: 'Juan',
  lastName: 'Pérez' // Opcional
});

// Eliminar contacto
await axios.delete(
  '${API_URL}/${instance.id}/contacts/528110000001?token=${instance.token}'
);

// Bloquear / Desbloquear contacto
await axios.post('${API_URL}/${instance.id}/contacts/block', {
  token: '${instance.token}',
  number: '528110000001@c.us',
  action: 'block' // 'block' | 'unblock'
});`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'reactions' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Reaccionar a un Mensaje</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Manda una reacción emoji a cualquier mensaje existente usando su <code>messageId</code>. Para <strong>eliminar</strong> la reacción, envía <code>emoji: ""</code> (string vacío).</p>
                      <div className="api-code-panel">
<pre>{`// Reaccionar con ❤️
await axios.post('${API_URL}/${instance.id}/messages/react', {
  token: '${instance.token}',
  to: '528110000001@c.us',
  messageId: '3EB0BC...', // ID del mensaje a reaccionar
  emoji: '❤️'           // Cualquier emoji: '👍', '😂', '😲', '😢', '🙏'
});

// Quitar la reacción
await axios.post('${API_URL}/${instance.id}/messages/react', {
  token: '${instance.token}',
  to: '528110000001@c.us',
  messageId: '3EB0BC...',
  emoji: '' // String vacío = elimina la reacción
});`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'labels' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Etiquetas (Labels) de WhatsApp Business</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Asigna o elimina etiquetas de chats y mensajes. El <code>labelId</code> se obtiene de las etiquetas ya creadas en tu WhatsApp Business (p. ej. "1", "2", etc.).</p>
                      <div className="api-code-panel">
<pre>{`// Agregar etiqueta a un CHAT completo
await axios.post('${API_URL}/${instance.id}/labels/chat', {
  token: '${instance.token}',
  to: '528110000001@c.us',
  labelId: '1' // ID de la etiqueta en WA Business
});

// Quitar etiqueta de un CHAT
await axios.delete('${API_URL}/${instance.id}/labels/chat', {
  data: { token: '${instance.token}', to: '528110000001@c.us', labelId: '1' }
});

// Agregar etiqueta a un MENSAJE específico
await axios.post('${API_URL}/${instance.id}/labels/message', {
  token: '${instance.token}',
  to: '528110000001@c.us',
  messageId: '3EB0BC...',
  labelId: '2'
});`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'profile_pic' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Obtener Foto de Perfil WhatsApp</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Extrae la URL de la foto de perfil en alta resolución de cualquier número de WhatsApp en el mundo pasando el parámetro <code>to</code>.</p>
                      <div className="api-code-panel">
<pre>{`const response = await axios.get(
  '${API_URL}/${instance.id}/contacts/profile-picture?token=${instance.token}&to=528110000000@c.us'
);

// Resultado: Link estático directo al avatar de la persona
{
  "profile_picture": "https://pps.whatsapp.net/v/t61.24694-24/302..."
}`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'create_instance' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Crear Nueva Instancia APi Dinámicamente</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Si estás construyendo un SaaS y necesitas generar contenedores automáticos para tus propios clientes, solo haz un request vacío y recibe las llaves maestras.</p>
                      <div className="api-code-panel">
<pre>{`const axios = require('axios');

const response = await axios.post('${API_URL}/instances');

// Resultado: Guarda estas credenciales en la DB de tu cliente
{
  "instance_id": "instance9f8b4a2c1e",
  "token": "4c210383c66241af8c04e5dfd244b593"
}`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'qr' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Obtener Código QR (Base64)</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Solicita el código QR más reciente para inyectarlo en tu propia página web en una etiqueta <code>&lt;img src=.../&gt;</code>.</p>
                      <div className="api-code-panel">
<pre>{`const response = await axios.get('${API_URL}/${instance.id}/qr?token=${instance.token}');

// Resultado: String puro listo para HTML
{
  "instanceId": "${instance.id}",
  "qr": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}`}</pre>
                      </div>
                    </>
                  )}
                  {apiTab === 'chat' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Enviar Chat (Texto o Emojis)</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Envía un mensaje usando el parámetro <code>body</code>. Los emojis son soportados de forma nativa enviando su código unicode en el texto.</p>
                      <div className="api-code-panel">
<pre>{`const axios = require('axios');

const response = await axios.post('${API_URL}/${instance.id}/messages/chat', {
  token: '${instance.token}',
  to: '528110000000@c.us',
  body: '¡Hola! Qué tal este emoji? 🚀😍'
});
console.log(response.data);`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'image' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Enviar Imagen</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Envía gráficos pasando un link público en el parámetro <code>image</code> y un texto descriptivo opcional en <code>caption</code>.</p>
                      <div className="api-code-panel">
<pre>{`const response = await axios.post('${API_URL}/${instance.id}/messages/image', {
  token: '${instance.token}',
  to: '528110000000@c.us',
  image: 'https://ejemplo.com/fotoperfil.jpg',
  caption: 'Este es el pie de foto 🔥'
});`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'document' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Enviar Documento (PDF, Excel, Zip)</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Comparte un archivo con tus usuarios. Puedes forzar el nombre del archivo definiendo <code>filename</code>.</p>
                      <div className="api-code-panel">
<pre>{`const response = await axios.post('${API_URL}/${instance.id}/messages/document', {
  token: '${instance.token}',
  to: '528110000000@c.us',
  document: 'https://ejemplo.com/reporte.pdf',
  filename: 'Reporte_Febrero.pdf'
});`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'webhook_message' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Estructura de Entrada (Webhook POST)</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Cuando alguien te manda un mensaje, encendemos tú servidor con una petición POST. Este es el Payload (body) crudo en formato JSON que te va a llegar:</p>
                      <div className="api-code-panel">
<pre>{`// Lo que recibe tu Servidor cuando te escriben
{
  "event_type": "message_received",
  "instanceId": "${instance.id}",
  "data": {
    "id": "3EB0BC...",
    "from": "5218110000000@c.us",
    "to": "BOT_NUMBER@c.us",
    "pushName": "Oscar 🚀",
    "body": "Deseo pedir pizza 🍕",
    "type": "chat",
    "fromMe": false,
    "timestamp": 1679091234,
    "__raw": { ... } // Metadatos profundos de Baileys
  }
}`}</pre>
                      </div>
                    </>
                  )}

                  {apiTab === 'webhook_params' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Directorio de Parámetros Útiles (Extracción)</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Si le vas a pedir a ChatGPT o a Antigravity que lea un mensaje de tu Gateway, diles que busquen estas variables en el Payload Webhook:</p>
                      <ul style={{fontSize:'0.85rem', paddingLeft: '1.25rem', lineHeight:'1.8', color:'var(--text-secondary)'}}>
                        <li><strong style={{color:'white'}}>Texto o Emojis del mensaje:</strong> <code>data.body</code> (Texto plano ya extraído).</li>
                        <li><strong style={{color:'white'}}>Número Ajeno entrante:</strong> <code>data.from</code> (Sufijo estándar en modo @c.us).</li>
                        <li><strong style={{color:'white'}}>Filtro Anti-Salientes:</strong> Analiza si <code>data.fromMe = true</code> para ignorar si tu bot se responde a sí mismo.</li>
                        <li><strong style={{color:'white'}}>Nombre del Cliente:</strong> <code>data.pushName</code> (Lo que puso el usuario en su biografía de WhatsApp).</li>
                        <li><strong style={{color:'white'}}>Tipo de medio:</strong> <code>data.type</code> (chat, image, document, audio, video).</li>
                      </ul>
                    </>
                  )}
                  
                  {apiTab === 'status' && (
                    <>
                      <h3 style={{marginBottom: '0.5rem', fontSize:'1rem'}}>Consultar Estado y Métricas</h3>
                      <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom: '1rem'}}>Obtén los contadores totales y el estado actual (conectado o desconectado).</p>
                      <div className="api-code-panel">
<pre>{`const response = await axios.get('${API_URL}/${instance.id}/status?token=${instance.token}');

// Resultado:
{
  "instanceId": "${instance.id}",
  "status": "authenticated", // "qr", "loading", "disconnected"
  "webhook_url": "https://...",
  "messages_sent": 142,
  "messages_received": 1058
}`}</pre>
                      </div>
                    </>
                  )}

                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {toast && (
        <div className="toast">
          {toast.type === 'success' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          ) : toast.type === 'error' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
          ) : (
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          )}
          <span style={{fontSize: '0.9rem', fontWeight: '500', color: '#fff'}}>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

export default App;
