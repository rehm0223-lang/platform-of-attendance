// Configuración de las preguntas de la asamblea.
// Reutiliza la conexión y la sesión que ya viven en script.js.
import { db, leerSesion } from "./script.js";
import {
  ref,
  push,
  set,
  update,
  remove,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const OPCIONES_SUGERIDAS = ["Sí", "No", "Abstención"];

// El reloj del servidor manda, para que el cierre sea igual para todos
// aunque alguien tenga la hora del computador corrida.
let desfaseServidor = 0;

function ahora() {
  return Date.now() + desfaseServidor;
}

function estadoDe(pregunta) {
  if (!pregunta.inicio) return "pendiente";
  if (pregunta.cierre && ahora() >= pregunta.cierre) return "cerrada";
  return "abierta";
}

function reloj(milisegundos) {
  const total = Math.max(0, Math.round(milisegundos / 1000));
  const minutos = Math.floor(total / 60);
  const segundos = total % 60;
  return minutos + ":" + String(segundos).padStart(2, "0");
}

function iniciarPreguntas() {
  const titulo = document.getElementById("titulo");
  const tipo = document.getElementById("tipo");
  const duracion = document.getElementById("duracion");
  const bloqueOpciones = document.getElementById("bloqueOpciones");
  const contenedorOpciones = document.getElementById("opciones");
  const btnAgregarOpcion = document.getElementById("btnAgregarOpcion");
  const multiple = document.getElementById("multiple");
  const error = document.getElementById("errorPregunta");
  const btnGuardar = document.getElementById("btnGuardar");
  const btnCancelar = document.getElementById("btnCancelar");
  const tituloFormulario = document.getElementById("tituloFormulario");
  const listaPreguntas = document.getElementById("listaPreguntas");
  const conteoPreguntas = document.getElementById("conteoPreguntas");

  let preguntas = [];
  let editandoId = null;

  onValue(ref(db, ".info/serverTimeOffset"), (snapshot) => {
    desfaseServidor = snapshot.val() || 0;
  });

  /* ----- Formulario ----- */

  function mostrarError(mensaje) {
    error.textContent = mensaje;
    error.hidden = false;
  }

  function filaOpcion(valor = "") {
    const fila = document.createElement("div");
    fila.className = "opcion-fila";

    const campo = document.createElement("input");
    campo.type = "text";
    campo.value = valor;
    campo.placeholder = "Texto de la opción";

    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "btn-mini";
    quitar.textContent = "Quitar";
    quitar.addEventListener("click", () => {
      fila.remove();
      if (!contenedorOpciones.children.length)
        contenedorOpciones.append(filaOpcion());
    });

    fila.append(campo, quitar);
    return fila;
  }

  function pintarOpciones(valores) {
    contenedorOpciones.innerHTML = "";
    const lista = valores && valores.length ? valores : OPCIONES_SUGERIDAS;
    lista.forEach((v) => contenedorOpciones.append(filaOpcion(v)));
  }

  function leerOpciones() {
    return Array.from(contenedorOpciones.querySelectorAll("input"))
      .map((i) => i.value.trim())
      .filter((v) => v !== "");
  }

  function alternarTipo() {
    bloqueOpciones.hidden = tipo.value !== "cerrada";
  }

  function limpiarFormulario() {
    editandoId = null;
    titulo.value = "";
    tipo.value = "cerrada";
    duracion.value = "5";
    multiple.checked = false;
    pintarOpciones(null);
    alternarTipo();
    error.hidden = true;
    tituloFormulario.textContent = "Nueva pregunta";
    btnGuardar.textContent = "Guardar pregunta";
    btnCancelar.hidden = true;
  }

  function cargarEnFormulario(pregunta) {
    editandoId = pregunta.id;
    titulo.value = pregunta.titulo;
    tipo.value = pregunta.tipo;
    duracion.value = String(pregunta.duracion || 5);
    multiple.checked = pregunta.multiple === true;
    pintarOpciones(pregunta.opciones);
    alternarTipo();
    error.hidden = true;
    tituloFormulario.textContent = "Editando pregunta";
    btnGuardar.textContent = "Guardar cambios";
    btnCancelar.hidden = false;
    titulo.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function guardar() {
    error.hidden = true;

    const textoTitulo = titulo.value.trim();
    if (!textoTitulo) {
      mostrarError("Escribe el texto de la pregunta.");
      return;
    }

    const minutos = Number(duracion.value);
    if (!Number.isFinite(minutos) || minutos < 1) {
      mostrarError("El tiempo para responder debe ser de al menos un minuto.");
      return;
    }

    const datos = {
      titulo: textoTitulo,
      tipo: tipo.value,
      duracion: minutos,
    };

    if (tipo.value === "cerrada") {
      const opciones = leerOpciones();

      if (opciones.length < 2) {
        mostrarError("Una pregunta cerrada necesita al menos dos opciones.");
        return;
      }

      const repetidas = new Set(opciones.map((o) => o.toLowerCase()));
      if (repetidas.size !== opciones.length) {
        mostrarError("Hay opciones repetidas. Cada una debe ser distinta.");
        return;
      }

      datos.opciones = opciones;
      datos.multiple = multiple.checked;
    } else {
      // Al pasar de cerrada a abierta hay que borrar lo que sobra.
      datos.opciones = null;
      datos.multiple = null;
    }

    btnGuardar.disabled = true;

    try {
      if (editandoId) {
        await update(ref(db, "preguntas/" + editandoId), datos);
      } else {
        const maximo = preguntas.reduce((m, p) => Math.max(m, p.orden), 0);
        datos.orden = maximo + 1;
        if (datos.opciones === null) delete datos.opciones;
        if (datos.multiple === null) delete datos.multiple;
        await set(push(ref(db, "preguntas")), datos);
      }
      limpiarFormulario();
    } catch (e) {
      console.error(e);
      mostrarError(
        "No se pudo guardar. Revisa la conexión e intenta otra vez.",
      );
    } finally {
      btnGuardar.disabled = false;
    }
  }

  /* ----- Control de la votación ----- */

  async function abrirVotacion(pregunta) {
    const arranque = ahora();

    try {
      await update(ref(db, "preguntas/" + pregunta.id), {
        inicio: arranque,
        cierre: arranque + pregunta.duracion * 60000,
      });
    } catch (e) {
      console.error(e);
      alert("No se pudo abrir la votación.");
    }
  }

  async function cerrarVotacion(pregunta) {
    try {
      await update(ref(db, "preguntas/" + pregunta.id), { cierre: ahora() });
    } catch (e) {
      console.error(e);
      alert("No se pudo cerrar la votación.");
    }
  }

  /* ----- Lista ----- */

  async function eliminar(pregunta) {
    const seguro = confirm('¿Eliminar la pregunta "' + pregunta.titulo + '"?');
    if (!seguro) return;

    try {
      await remove(ref(db, "preguntas/" + pregunta.id));
      if (editandoId === pregunta.id) limpiarFormulario();
    } catch (e) {
      console.error(e);
      alert("No se pudo eliminar la pregunta.");
    }
  }

  async function mover(indice, direccion) {
    const actual = preguntas[indice];
    const vecina = preguntas[indice + direccion];
    if (!actual || !vecina) return;

    try {
      await update(ref(db, "preguntas"), {
        [actual.id + "/orden"]: vecina.orden,
        [vecina.id + "/orden"]: actual.orden,
      });
    } catch (e) {
      console.error(e);
      alert("No se pudo cambiar el orden.");
    }
  }

  function botonMini(texto, alClic, clase) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "btn-mini" + (clase ? " " + clase : "");
    boton.textContent = texto;
    boton.addEventListener("click", alClic);
    return boton;
  }

  function pintarLista() {
    conteoPreguntas.textContent =
      preguntas.length === 1 ? "1 pregunta" : preguntas.length + " preguntas";

    listaPreguntas.innerHTML = "";

    if (!preguntas.length) {
      listaPreguntas.innerHTML =
        '<p class="vacio">Todavía no hay preguntas. Crea la primera arriba.</p>';
      return;
    }

    preguntas.forEach((p, indice) => {
      const estado = estadoDe(p);

      const fila = document.createElement("div");
      fila.className = "fila";

      const numero = document.createElement("span");
      numero.className = "fila-numero";
      numero.textContent = indice + 1;

      const info = document.createElement("div");
      info.className = "fila-info";

      const texto = document.createElement("p");
      texto.className = "fila-nombre";
      texto.textContent = p.titulo;

      const meta = document.createElement("p");
      meta.className = "fila-meta";
      const partes = [];
      if (p.tipo === "cerrada") {
        partes.push("Cerrada · " + (p.multiple ? "varias respuestas" : "una respuesta"));
        partes.push(p.opciones.join(" / "));
      } else {
        partes.push("Abierta · el propietario escribe su respuesta");
      }
      partes.push(p.duracion + " min");
      meta.textContent = partes.join("  ·  ");

      const sello = document.createElement("span");
      if (estado === "abierta") {
        sello.className = "sello abierto";
        sello.textContent = "Abierta · quedan " + reloj(p.cierre - ahora());
      } else if (estado === "cerrada") {
        sello.className = "sello cerrado";
        sello.textContent = "Cerrada";
      } else {
        sello.className = "sello";
        sello.textContent = "Sin abrir";
      }

      info.append(texto, meta, sello);

      const acciones = document.createElement("div");
      acciones.className = "fila-acciones";

      if (estado === "abierta") {
        acciones.append(botonMini("Cerrar ahora", () => cerrarVotacion(p), "peligro"));
      } else {
        acciones.append(
          botonMini(
            estado === "cerrada" ? "Abrir de nuevo" : "Abrir votación",
            () => abrirVotacion(p),
          ),
        );
      }

      acciones.append(
        botonMini("↑", () => mover(indice, -1)),
        botonMini("↓", () => mover(indice, 1)),
        botonMini("Editar", () => cargarEnFormulario(p)),
        botonMini("Eliminar", () => eliminar(p), "peligro"),
      );

      if (indice === 0) acciones.children[1].disabled = true;
      if (indice === preguntas.length - 1) acciones.children[2].disabled = true;

      fila.append(numero, info, acciones);
      listaPreguntas.append(fila);
    });
  }

  /* ----- Escucha en vivo ----- */

  onValue(
    ref(db, "preguntas"),
    (snapshot) => {
      preguntas = [];

      snapshot.forEach((hijo) => {
        const datos = hijo.val();
        if (!datos) return;

        preguntas.push({
          id: hijo.key,
          titulo: String(datos.titulo || ""),
          tipo: datos.tipo === "abierta" ? "abierta" : "cerrada",
          opciones: Array.isArray(datos.opciones)
            ? datos.opciones.filter((o) => o)
            : Object.values(datos.opciones || {}),
          multiple: datos.multiple === true,
          duracion: Number(datos.duracion) || 5,
          inicio: Number(datos.inicio) || 0,
          cierre: Number(datos.cierre) || 0,
          orden: Number(datos.orden) || 0,
        });
      });

      preguntas.sort((a, b) => a.orden - b.orden);
      pintarLista();
    },
    (e) => {
      console.error(e);
      listaPreguntas.innerHTML =
        '<p class="vacio">No se pudieron cargar las preguntas. Revisa las reglas de la base de datos.</p>';
    },
  );

  // Refresca el cronómetro mientras haya alguna votación abierta.
  setInterval(() => {
    if (preguntas.some((p) => estadoDe(p) === "abierta")) pintarLista();
  }, 1000);

  /* ----- Eventos ----- */

  tipo.addEventListener("change", alternarTipo);
  btnAgregarOpcion.addEventListener("click", () =>
    contenedorOpciones.append(filaOpcion()),
  );
  btnGuardar.addEventListener("click", guardar);
  btnCancelar.addEventListener("click", limpiarFormulario);

  limpiarFormulario();
}

const sesion = leerSesion();
if (sesion && sesion.type === "0") {
  iniciarPreguntas();
}