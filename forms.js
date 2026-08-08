// Vista del votante: puede ser el propietario o su apoderado.
// Una misma persona puede representar varios inmuebles a la vez.
import { db, leerSesion, apoderadosDe } from "./script.js";
import {
  ref,
  get,
  set,
  update,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

function porcentaje(valor) {
  return (valor * 100).toFixed(2);
}

// El reloj del servidor manda, para que el cierre caiga al mismo tiempo
// para todos aunque alguien tenga mal la hora del celular.
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

async function iniciarFormulario(sesion) {
  const contenedor = document.getElementById("preguntasPropietario");
  const identidad = document.getElementById("identidad");
  const identidadNombre = document.getElementById("identidadNombre");
  const identidadMeta = document.getElementById("identidadMeta");

  const cedula = sesion.user;

  onValue(ref(db, ".info/serverTimeOffset"), (snapshot) => {
    desfaseServidor = snapshot.val() || 0;
  });

  /* ----- A quién representa esta cédula -----
     Puede ser dueño de sus propios inmuebles, apoderado de otros, o las
     dos cosas. En todos los casos se suman los coeficientes. */

  const [snapPropietarios, snapInmuebles] = await Promise.all([
    get(ref(db, "propietarios")),
    get(ref(db, "inmuebles"))
  ]);

  const representados = [];
  let nombrePersona = "";

  snapPropietarios.forEach((hijo) => {
    const datos = hijo.val();
    if (!datos) return;

    const esDueno = hijo.key === cedula;
    const apoderado = apoderadosDe(datos).find(
      (a) => a.identificacion === cedula
    );

    if (!esDueno && !apoderado) return;

    if (esDueno) nombrePersona = String(datos.nombre || cedula);
    else if (!nombrePersona && apoderado.nombre) nombrePersona = apoderado.nombre;

    representados.push({
      id: hijo.key,
      nombre: String(datos.nombre || hijo.key),
      esDueno: esDueno,
      // Con qué credencial entra: como dueño o como apoderado de este inmueble.
      apoderado: esDueno ? null : apoderado,
      registroAsistencia: datos.registroAsistencia || 0,
      asistio: datos.asistio === true
    });
  });

  if (!representados.length) {
    contenedor.innerHTML =
      '<p class="vacio">Tu cédula no figura como propietario ni como apoderado. Avisa a la administración.</p>';
    return;
  }

  const ids = representados.map((r) => r.id);

  let coeficiente = 0;
  const unidades = [];

  snapInmuebles.forEach((hijo) => {
    const inmueble = hijo.val();
    if (!inmueble || !ids.includes(String(inmueble.propietarioId))) return;

    const coef = Number(inmueble.coeficienteVoto) || 0;
    coeficiente += coef;
    if (coef > 0) unidades.push(String(inmueble.nombre));
  });

  identidadNombre.textContent = nombrePersona || cedula;

  const partes = [];
  if (unidades.length) partes.push(unidades.join(", "));

  const enRepresentacion = representados
    .filter((r) => !r.esDueno)
    .map((r) => r.nombre);

  if (enRepresentacion.length) {
    partes.push("Como apoderado de " + enRepresentacion.join(" y "));
  }

  partes.push("Tu voto pesa " + porcentaje(coeficiente) + "%");
  identidadMeta.textContent = partes.join("  ·  ");
  identidad.hidden = false;

  /* ----- Asistencia automática al entrar ----- */

  const aviso = document.getElementById("avisoAsistencia");

  // Se marca a todos los que esta persona representa, y solo la primera vez.
  const porMarcar = representados.filter((r) => !r.registroAsistencia);

  if (porMarcar.length) {
    const cambios = {};
    porMarcar.forEach((r) => {
      cambios[r.id + "/asistio"] = true;
      cambios[r.id + "/registroAsistencia"] = Date.now();

      // Queda el rastro de quién hizo el ingreso: el dueño o su apoderado.
      cambios[r.id + "/registradoPor"] = {
        identificacion: cedula,
        nombre: r.esDueno
          ? r.nombre
          : (r.apoderado && r.apoderado.nombre) || cedula,
        tipo: r.esDueno ? "propietario" : "apoderado"
      };
    });

    try {
      await update(ref(db, "propietarios"), cambios);
      aviso.textContent =
        representados.length === 1
          ? "Tu asistencia quedó registrada."
          : "Se registró la asistencia de los " +
            representados.length +
            " inmuebles que representas.";
      aviso.hidden = false;
    } catch (e) {
      console.error(e);
      aviso.textContent =
        "No se pudo registrar tu asistencia. Avisa a la administración.";
      aviso.className = "guardado alerta";
      aviso.hidden = false;
    }
  } else if (representados.some((r) => r.asistio)) {
    aviso.textContent = "Tu asistencia está registrada.";
    aviso.hidden = false;
  }

  /* ----- Preguntas y respuestas ----- */

  let preguntas = [];
  let misRespuestas = {};
  let firmaPintada = "";
  let pintadas = [];

  function valorElegido(bloque, pregunta) {
    if (pregunta.tipo === "abierta") {
      const texto = bloque.querySelector("textarea").value.trim();
      return texto === "" ? null : texto;
    }

    const marcadas = Array.from(
      bloque.querySelectorAll("input:checked")
    ).map((i) => i.value);

    if (!marcadas.length) return null;
    return pregunta.multiple ? marcadas : marcadas[0];
  }

  async function responder(pregunta, bloque, boton, mensaje) {
    // Se revisa otra vez al momento de enviar: entre que se pintó la
    // pantalla y el clic pudo cerrarse la votación.
    if (estadoDe(pregunta) !== "abierta") {
      mensaje.textContent = "La votación de este punto ya cerró.";
      mensaje.className = "guardado alerta";
      mensaje.hidden = false;
      return;
    }

    if (misRespuestas[pregunta.id] !== undefined) {
      mensaje.textContent = "Ya respondiste este punto.";
      mensaje.className = "guardado alerta";
      mensaje.hidden = false;
      return;
    }

    const valor = valorElegido(bloque, pregunta);

    if (valor === null) {
      mensaje.textContent =
        pregunta.tipo === "abierta"
          ? "Escribe tu respuesta antes de enviar."
          : "Selecciona una opción antes de enviar.";
      mensaje.className = "guardado alerta";
      mensaje.hidden = false;
      return;
    }

    const seguro = confirm(
      representados.length === 1
        ? "Tu respuesta quedará registrada y no se podrá cambiar. ¿Confirmas?"
        : "Se registrará este voto por los " +
          representados.length +
          " inmuebles que representas y no se podrá cambiar. ¿Confirmas?"
    );
    if (!seguro) return;

    boton.disabled = true;
    try {
      // Un mismo voto se guarda a nombre de cada representado, para que el
      // reporte sume los coeficientes sin cambiar nada de su lógica.
      const cambios = {};
      representados.forEach((r) => {
        cambios[r.id] = { valor: valor, fecha: Date.now(), votadaPor: cedula };
      });

      await update(ref(db, "respuestas/" + pregunta.id), cambios);

      misRespuestas[pregunta.id] = valor;
      firmaPintada = "";
      pintar();
    } catch (e) {
      console.error(e);
      mensaje.textContent = "No se pudo guardar. Intenta otra vez.";
      mensaje.className = "guardado alerta";
      mensaje.hidden = false;
      boton.disabled = false;
    }
  }

  function textoValor(valor) {
    return Array.isArray(valor) ? valor.join(", ") : String(valor);
  }

  function pintar() {
    const estados = preguntas.map((p) => estadoDe(p)).join("|");
    const firma =
      JSON.stringify(preguntas) + JSON.stringify(misRespuestas) + estados;
    if (firma === firmaPintada) return;
    firmaPintada = firma;

    contenedor.innerHTML = "";
    pintadas = [];

    if (!preguntas.length) {
      contenedor.innerHTML =
        '<p class="vacio">Todavía no hay preguntas publicadas. Espera indicaciones de la administración.</p>';
      return;
    }

    preguntas.forEach((pregunta, indice) => {
      const previa = misRespuestas[pregunta.id];
      const respondida = previa !== undefined;
      const estado = estadoDe(pregunta);
      const bloqueada = respondida || estado !== "abierta";

      const bloque = document.createElement("article");
      bloque.className = "pregunta" + (respondida ? " respondida" : "");

      const numero = document.createElement("p");
      numero.className = "eyebrow";
      numero.textContent = "Punto " + (indice + 1);

      const texto = document.createElement("h2");
      texto.className = "pregunta-titulo";
      texto.textContent = pregunta.titulo;

      const sello = document.createElement("span");
      if (respondida) {
        sello.className = "sello cerrado";
        sello.textContent = "Ya respondiste";
      } else if (estado === "pendiente") {
        sello.className = "sello";
        sello.textContent = "Aún no abre";
      } else if (estado === "cerrada") {
        sello.className = "sello cerrado";
        sello.textContent = "Votación cerrada";
      } else {
        sello.className = "sello abierto";
        sello.textContent = "Quedan " + reloj(pregunta.cierre - ahora());
      }

      bloque.append(numero, texto, sello);

      if (pregunta.tipo === "abierta") {
        const area = document.createElement("textarea");
        area.rows = 4;
        area.placeholder = "Escribe tu respuesta";
        area.disabled = bloqueada;
        if (typeof previa === "string") area.value = previa;
        bloque.append(area);
      } else {
        const grupo = document.createElement("div");
        grupo.className = "opciones-voto";

        const previas = Array.isArray(previa) ? previa : [previa];

        pregunta.opciones.forEach((opcion, i) => {
          const etiqueta = document.createElement("label");
          etiqueta.className = "opcion-voto" + (bloqueada ? " bloqueada" : "");

          const control = document.createElement("input");
          control.type = pregunta.multiple ? "checkbox" : "radio";
          control.name = "pregunta-" + pregunta.id;
          control.value = opcion;
          control.checked = previas.includes(opcion);
          control.disabled = bloqueada;
          control.id = "opcion-" + pregunta.id + "-" + i;

          const span = document.createElement("span");
          span.textContent = opcion;

          etiqueta.append(control, span);
          grupo.append(etiqueta);
        });

        bloque.append(grupo);
      }

      const mensaje = document.createElement("p");
      mensaje.className = "guardado";
      mensaje.hidden = true;

      const acciones = document.createElement("div");
      acciones.className = "acciones";

      if (respondida) {
        mensaje.textContent = "Tu respuesta: " + textoValor(previa);
        mensaje.hidden = false;
        acciones.append(mensaje);
      } else if (estado === "abierta") {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "btn btn-auto";
        boton.textContent = "Enviar respuesta";
        boton.addEventListener("click", () =>
          responder(pregunta, bloque, boton, mensaje)
        );
        acciones.append(boton, mensaje);
      } else {
        mensaje.textContent =
          estado === "pendiente"
            ? "La administración aún no abre este punto."
            : "No alcanzaste a responder este punto.";
        mensaje.className = "guardado alerta";
        mensaje.hidden = false;
        acciones.append(mensaje);
      }

      bloque.append(acciones);
      contenedor.append(bloque);

      pintadas.push({ pregunta, sello, estado });
    });
  }

  // Cada segundo se refresca el conteo; si alguna pregunta cambió de
  // estado, se vuelve a pintar todo.
  setInterval(() => {
    let cambio = false;

    pintadas.forEach((registro) => {
      const estado = estadoDe(registro.pregunta);

      if (estado !== registro.estado) {
        cambio = true;
      } else if (
        estado === "abierta" &&
        misRespuestas[registro.pregunta.id] === undefined
      ) {
        registro.sello.textContent =
          "Quedan " + reloj(registro.pregunta.cierre - ahora());
      }
    });

    if (cambio) {
      firmaPintada = "";
      pintar();
    }
  }, 1000);

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
          orden: Number(datos.orden) || 0
        });
      });

      preguntas.sort((a, b) => a.orden - b.orden);
      pintar();
    },
    (e) => {
      console.error(e);
      contenedor.innerHTML =
        '<p class="vacio">No se pudieron cargar las preguntas. Revisa las reglas de la base de datos.</p>';
    }
  );

  onValue(ref(db, "respuestas"), (snapshot) => {
    misRespuestas = {};

    snapshot.forEach((hijo) => {
      // Basta con que uno de los representados tenga respuesta:
      // el voto se guarda igual para todos.
      for (const id of ids) {
        const suya = hijo.child(id);
        if (suya.exists()) {
          const guardado = suya.val();
          misRespuestas[hijo.key] = guardado ? guardado.valor : undefined;
          break;
        }
      }
    });

    pintar();
  });
}

const sesion = leerSesion();
if (sesion && sesion.type !== "0") {
  iniciarFormulario(sesion);
}