
/* =================================
   ELEMENTOS DEL DOM
================================= */

const chatForm = document.getElementById("chat-form");
const inputMensaje = document.getElementById("mensaje");
const sendButton = document.getElementById("send-button");
const chatMessages = document.getElementById("chat-messages");
const charCounter = document.getElementById("char-counter");

const MAX_CARACTERES = 500;
const TIEMPO_MINIMO = 1500;
const TIEMPO_LIMITE = 30000;

let ultimoEnvio = 0;
let memoriaSessionId = null;

/* =================================
   IDENTIFICADOR DE SESIÓN
================================= */

function generarSessionId() {
    if (typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return Date.now().toString(36) +
        Math.random().toString(36).substring(2);
}

function obtenerSessionId() {
    try {
        const guardado = localStorage.getItem("nutriconista_session_id");

        if (guardado) {
            memoriaSessionId = guardado;
            return guardado;
        }

        memoriaSessionId = generarSessionId();

        localStorage.setItem(
            "nutriconista_session_id",
            memoriaSessionId
        );

        return memoriaSessionId;

    } catch (error) {
        if (!memoriaSessionId) {
            memoriaSessionId = generarSessionId();
        }

        return memoriaSessionId;
    }
}

const sessionId = obtenerSessionId();

/* =================================
   CREAR MENSAJES
================================= */

function agregarMensaje(texto, tipo) {
    const message = document.createElement("div");
    message.classList.add("message", tipo);

    const content = document.createElement("div");
    content.classList.add("message-content");

    // Todo contenido se inserta mediante textContent.
    content.textContent = texto;

    message.appendChild(content);
    chatMessages.appendChild(message);

    chatMessages.scrollTop = chatMessages.scrollHeight;

    return message;
}

/* =================================
   INDICADOR DE CARGA
================================= */

function mostrarCarga() {
    const message = document.createElement("div");

    message.classList.add(
        "message",
        "agent-message",
        "loading-message"
    );

    const content = document.createElement("div");
    content.classList.add("message-content");

    content.textContent = "Nutriconista está escribiendo";

    const dots = document.createElement("span");
    dots.classList.add("loading-dots");

    for (let i = 0; i < 3; i++) {
        const dot = document.createElement("span");
        dots.appendChild(dot);
    }

    content.appendChild(dots);
    message.appendChild(content);
    chatMessages.appendChild(message);

    chatMessages.scrollTop = chatMessages.scrollHeight;

    return message;
}

/* =================================
   ESTADOS DE LA INTERFAZ
================================= */

function cambiarEstado(cargando) {
    inputMensaje.disabled = cargando;
    sendButton.disabled = cargando;
}

/* =================================
   OBTENER RESPUESTA DE MAKE
================================= */

function interpretarRespuesta(texto) {
    if (!texto || !texto.trim()) {
        return "(respuesta vacía)";
    }

    try {
        const datos = JSON.parse(texto);

        if (datos !== null &&
            typeof datos === "object" &&
            !Array.isArray(datos)) {

            const propiedades = [
                "response",
                "respuesta",
                "message",
                "mensaje"
            ];

            for (const propiedad of propiedades) {
                const valor = datos[propiedad];

                if (typeof valor === "string" &&
                    valor.trim() !== "") {
                    return valor;
                }
            }

            return "Make respondió, pero sin el campo response";
        }

        return "Make respondió, pero sin el campo response";

    } catch (error) {
        // Si no es JSON, se muestra el texto original.
        return texto;
    }
}

/* =================================
   PAUSA ENTRE ENVÍOS
================================= */

async function esperarIntervalo() {
    const transcurrido = Date.now() - ultimoEnvio;
    const restante = TIEMPO_MINIMO - transcurrido;

    if (restante > 0) {
        await new Promise(resolve =>
            setTimeout(resolve, restante)
        );
    }
}

/* =================================
   ENVÍO AL WEBHOOK
================================= */

async function enviarMensaje(mensaje) {

    let indicadorCarga = null;
    let controlador = null;
    let temporizador = null;

    cambiarEstado(true);

    indicadorCarga = mostrarCarga();

    try {

        // Comprobar configuración del webhook.
        if (!WEBHOOK_URL || WEBHOOK_URL.includes("ACA VA")) {
            throw new Error("WEBHOOK_NO_CONFIGURADO");
        }

        // Respetar el intervalo mínimo entre envíos.
        await esperarIntervalo();

        controlador = new AbortController();

        // Tiempo máximo de espera: 30 segundos.
        temporizador = setTimeout(() => {
            controlador.abort();
        }, TIEMPO_LIMITE);

        const fecha = new Date().toISOString();

        const datos = {
            sessionId: sessionId,
            mensaje: mensaje,
            fecha: fecha
        };

        ultimoEnvio = Date.now();

        const respuesta = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(datos),
            signal: controlador.signal
        });

        // Leer la respuesta como texto.
        const texto = await respuesta.text();

        // Controlar errores HTTP.
        if (!respuesta.ok) {
            agregarMensaje(
                `Make respondió con error (código ${respuesta.status}). Revisá que tu escenario esté en Active o que hayas apretado Run once.`,
                "agent-message"
            );

            return;
        }

        // Interpretar la respuesta.
        const respuestaFinal = interpretarRespuesta(texto);

        agregarMensaje(respuestaFinal, "agent-message");

    } catch (error) {

        if (error.message === "WEBHOOK_NO_CONFIGURADO") {

            agregarMensaje(
                "Falta pegar la URL de tu webhook en config.js",
                "agent-message"
            );

        } else if (error.name === "AbortError") {

            agregarMensaje(
                "La solicitud superó el tiempo máximo de espera de 30 segundos. Intentá nuevamente.",
                "agent-message"
            );

        } else {

            agregarMensaje(
                "No se pudo conectar con Nutriconista. Revisá tu conexión a internet y la configuración del webhook.",
                "agent-message"
            );

        }

    } finally {

        // Limpiar temporizador y estado de carga.
        if (temporizador) {
            clearTimeout(temporizador);
        }

        if (indicadorCarga) {
            indicadorCarga.remove();
        }

        cambiarEstado(false);
        inputMensaje.focus();
    }
}

/* =================================
   EVENTO DE ENVÍO
================================= */

chatForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const mensaje = inputMensaje.value.trim();

    // Validar que el mensaje no esté vacío.
    if (!mensaje) {
        return;
    }

    // Validar longitud máxima.
    if (mensaje.length > MAX_CARACTERES) {
        agregarMensaje(
            "El mensaje no puede superar los 500 caracteres.",
            "agent-message"
        );
        return;
    }

    // Mostrar mensaje del usuario.
    agregarMensaje(mensaje, "user-message");

    // Limpiar el campo.
    inputMensaje.value = "";

    actualizarContador();

    // Enviar mensaje al agente.
    await enviarMensaje(mensaje);

});

/* =================================
   CONTADOR DE CARACTERES
================================= */

function actualizarContador() {
    const cantidad = inputMensaje.value.length;

    charCounter.textContent =
        `${cantidad} / ${MAX_CARACTERES}`;
}

inputMensaje.addEventListener("input", actualizarContador);

/* =================================
   INICIALIZACIÓN
================================= */

actualizarContador();
inputMensaje.focus();
