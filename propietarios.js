// Alta y administración de propietarios y sus inmuebles.
// Crear un propietario toca dos nodos a la vez: propietarios/<id> y
// usuarios/<id>, que es lo que le da el acceso.
import { db, leerSesion, apoderadosDe } from "./script.js";
import {
  ref,
  set,
  update,
  remove,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const ORDEN_TIPO = { apartamento: 0, deposito: 1, parqueadero: 2 };

function porcentaje(valor) {
  return (valor * 100).toFixed(2);
}

// Las llaves de Realtime Database no aceptan . # $ [ ] /
function claveInmueble(nombre) {
  return String(nombre)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function limpiarIdentificacion(valor) {
  return String(valor).replace(/[.\s]/g, "").trim();
}

function iniciarPropietarios() {
  const identificacion = document.getElementById("identificacion");
  const nombrePropietario = document.getElementById("nombrePropietario");
  const errorPropietario = document.getElementById("errorPropietario");
  const notaPropietario = document.getElementById("notaPropietario");
  const btnGuardarPropietario = document.getElementById("btnGuardarPropietario");
  const btnCancelarPropietario = document.getElementById("btnCancelarPropietario");
  const tituloPropietario = document.getElementById("tituloPropietario");

  const duenoInmueble = document.getElementById("duenoInmueble");
  const nombreInmueble = document.getElementById("nombreInmueble");
  const tipoInmueble = document.getElementById("tipoInmueble");
  const coefRPH = document.getElementById("coefRPH");
  const coefVoto = document.getElementById("coefVoto");
  const errorInmueble = document.getElementById("errorInmueble");
  const btnGuardarInmueble = document.getElementById("btnGuardarInmueble");
  const btnCancelarInmueble = document.getElementById("btnCancelarInmueble");
  const tituloInmueble = document.getElementById("tituloInmueble");

  const buscador = document.getElementById("buscador");
  const conteoLista = document.getElementById("conteoLista");
  const lista = document.getElementById("lista");
  const totales = document.getElementById("totales");
  const avisoTotales = document.getElementById("avisoTotales");

  lista.innerHTML = '<p class="vacio">Cargando...</p>';

  let propietarios = [];
  let inmuebles = [];
  let editandoPropietario = null; // identificación en edición
  let editandoInmueble = null; // clave del inmueble en edición

  /* ---------- Propietario ---------- */

  function limpiarPropietario() {
    editandoPropietario = null;
    identificacion.value = "";
    identificacion.disabled = false;
    nombrePropietario.value = "";
    errorPropietario.hidden = true;
    notaPropietario.hidden = true;
    tituloPropietario.textContent = "Nuevo propietario";
    btnGuardarPropietario.textContent = "Guardar propietario";
    btnCancelarPropietario.hidden = true;
  }

  function cargarPropietario(p) {
    editandoPropietario = p.id;
    identificacion.value = p.id;
    // La identificación es la llave del propietario y de su usuario:
    // cambiarla sería crear otro, no editar este.
    identificacion.disabled = true;
    nombrePropietario.value = p.nombre;
    errorPropietario.hidden = true;
    notaPropietario.hidden = true;
    tituloPropietario.textContent = "Editando propietario";
    btnGuardarPropietario.textContent = "Guardar cambios";
    btnCancelarPropietario.hidden = false;
    nombrePropietario.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function guardarPropietario() {
    errorPropietario.hidden = true;
    notaPropietario.hidden = true;

    const id = limpiarIdentificacion(identificacion.value);
    const nombre = nombrePropietario.value.trim();

    if (!id) {
      errorPropietario.textContent = "Escribe la identificación.";
      errorPropietario.hidden = false;
      return;
    }

    if (/[.#$[\]/]/.test(id)) {
      errorPropietario.textContent =
        "La identificación no puede llevar puntos ni los signos # $ [ ] /";
      errorPropietario.hidden = false;
      return;
    }

    if (!nombre) {
      errorPropietario.textContent = "Escribe el nombre del propietario.";
      errorPropietario.hidden = false;
      return;
    }

    if (!editandoPropietario && propietarios.some((p) => p.id === id)) {
      errorPropietario.textContent =
        "Ya existe un propietario con esa identificación.";
      errorPropietario.hidden = false;
      return;
    }

    btnGuardarPropietario.disabled = true;

    try {
      if (editandoPropietario) {
        await update(ref(db, "propietarios/" + editandoPropietario), { nombre });
      } else {
        // Propietario y acceso se crean juntos, en una sola escritura.
        await update(ref(db), {
          ["propietarios/" + id]: {
            identificacion: id,
            nombre: nombre,
            asistio: false,
          },
          ["usuarios/" + id]: { user: id, password: id, type: "1" },
        });

        notaPropietario.textContent =
          "Creado. Entra con " + id + " como usuario y como contraseña.";
        notaPropietario.hidden = false;
      }

      const aviso = notaPropietario.textContent;
      const mostrarAviso = !notaPropietario.hidden;
      limpiarPropietario();

      if (mostrarAviso) {
        notaPropietario.textContent = aviso;
        notaPropietario.hidden = false;
      }
    } catch (e) {
      console.error(e);
      errorPropietario.textContent =
        "No se pudo guardar. Revisa la conexión e intenta otra vez.";
      errorPropietario.hidden = false;
    } finally {
      btnGuardarPropietario.disabled = false;
    }
  }

  async function eliminarPropietario(p) {
    const suyos = inmuebles.filter((i) => i.propietarioId === p.id);

    if (suyos.length) {
      alert(
        "No se puede eliminar: " +
          p.nombre +
          " todavía tiene " +
          suyos.length +
          " inmueble(s). Reasígnalos o elimínalos primero.",
      );
      return;
    }

    const seguro = confirm(
      "¿Eliminar a " + p.nombre + " y su acceso a la plataforma?",
    );
    if (!seguro) return;

    try {
      await update(ref(db), {
        ["propietarios/" + p.id]: null,
        ["usuarios/" + p.id]: null,
      });

      if (editandoPropietario === p.id) limpiarPropietario();
    } catch (e) {
      console.error(e);
      alert("No se pudo eliminar.");
    }
  }

  /* ---------- Inmueble ---------- */

  function limpiarInmueble() {
    editandoInmueble = null;
    nombreInmueble.value = "";
    tipoInmueble.value = "apartamento";
    coefRPH.value = "";
    coefVoto.value = "";
    errorInmueble.hidden = true;
    tituloInmueble.textContent = "Nuevo inmueble";
    btnGuardarInmueble.textContent = "Guardar inmueble";
    btnCancelarInmueble.hidden = true;
  }

  function cargarInmueble(i) {
    editandoInmueble = i.clave;
    duenoInmueble.value = i.propietarioId;
    nombreInmueble.value = i.nombre;
    tipoInmueble.value = i.tipo || "apartamento";
    coefRPH.value = (i.coefRPH * 100).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    coefVoto.value = (i.coefVoto * 100).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    errorInmueble.hidden = true;
    tituloInmueble.textContent = "Editando inmueble";
    btnGuardarInmueble.textContent = "Guardar cambios";
    btnCancelarInmueble.hidden = false;
    nombreInmueble.focus();
    nombreInmueble.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function guardarInmueble() {
    errorInmueble.hidden = true;

    const dueno = duenoInmueble.value;
    const nombre = nombreInmueble.value.trim();
    const clave = claveInmueble(nombre);
    const rph = Number(coefRPH.value) / 100;
    const voto = Number(coefVoto.value || 0) / 100;

    if (!dueno) {
      errorInmueble.textContent = "Elige a qué propietario pertenece.";
      errorInmueble.hidden = false;
      return;
    }

    if (!nombre || !clave) {
      errorInmueble.textContent = "Escribe el nombre del inmueble.";
      errorInmueble.hidden = false;
      return;
    }

    if (!Number.isFinite(rph) || rph < 0) {
      errorInmueble.textContent = "El coeficiente del RPH no es válido.";
      errorInmueble.hidden = false;
      return;
    }

    if (!Number.isFinite(voto) || voto < 0) {
      errorInmueble.textContent = "El coeficiente de votación no es válido.";
      errorInmueble.hidden = false;
      return;
    }

    const repetido = inmuebles.some(
      (i) => i.clave === clave && i.clave !== editandoInmueble,
    );

    if (repetido) {
      errorInmueble.textContent =
        "Ya existe un inmueble con ese nombre (" + clave + ").";
      errorInmueble.hidden = false;
      return;
    }

    btnGuardarInmueble.disabled = true;

    try {
      const datos = {
        nombre: nombre,
        tipo: tipoInmueble.value,
        coeficienteRPH: rph,
        coeficienteVoto: voto,
        propietarioId: dueno,
      };

      // Si al editar cambió el nombre, cambia la llave: se borra la vieja.
      if (editandoInmueble && editandoInmueble !== clave) {
        await remove(ref(db, "inmuebles/" + editandoInmueble));
      }

      await set(ref(db, "inmuebles/" + clave), datos);
      limpiarInmueble();
    } catch (e) {
      console.error(e);
      errorInmueble.textContent =
        "No se pudo guardar. Revisa la conexión e intenta otra vez.";
      errorInmueble.hidden = false;
    } finally {
      btnGuardarInmueble.disabled = false;
    }
  }

  async function eliminarInmueble(i) {
    const seguro = confirm("¿Eliminar el inmueble " + i.nombre + "?");
    if (!seguro) return;

    try {
      await remove(ref(db, "inmuebles/" + i.clave));
      if (editandoInmueble === i.clave) limpiarInmueble();
    } catch (e) {
      console.error(e);
      alert("No se pudo eliminar el inmueble.");
    }
  }

  /* ---------- Pintado ---------- */

  function botonMini(texto, alClic, clase) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "btn-mini" + (clase ? " " + clase : "");
    boton.textContent = texto;
    boton.addEventListener("click", alClic);
    return boton;
  }

  function pintarTotales() {
    const sumaRPH = inmuebles.reduce((s, i) => s + i.coefRPH, 0);
    const sumaVoto = inmuebles.reduce((s, i) => s + i.coefVoto, 0);
    const votan = inmuebles.filter((i) => i.coefVoto > 0).length;

    totales.innerHTML = "";

    [
      [String(propietarios.length), "Propietarios"],
      [String(inmuebles.length), "Inmuebles"],
      [String(votan), "Unidades que votan"],
      [porcentaje(sumaRPH) + "%", "Suma coef. RPH"],
      [porcentaje(sumaVoto) + "%", "Suma coef. de voto"],
    ].forEach(([valor, etiqueta]) => {
      const metrica = document.createElement("div");
      metrica.className = "metrica";

      const cifra = document.createElement("span");
      cifra.className = "metrica-valor";
      cifra.textContent = valor;

      const nombre = document.createElement("span");
      nombre.className = "metrica-etiqueta";
      nombre.textContent = etiqueta;

      metrica.append(cifra, nombre);
      totales.append(metrica);
    });

    // Las dos sumas deben dar 100%. Si no, el quórum sale corrido.
    const desviados = [];
    if (Math.abs(sumaRPH - 1) > 0.0001) desviados.push("el del RPH");
    if (Math.abs(sumaVoto - 1) > 0.0001) desviados.push("el de votación");

    if (desviados.length) {
      avisoTotales.textContent =
        "Atención: " +
        desviados.join(" y ") +
        " no suma 100%. Mientras eso pase, el quórum y los resultados salen corridos.";
      avisoTotales.classList.remove("alcanzado");
    } else {
      avisoTotales.textContent = "Los dos coeficientes suman 100%.";
      avisoTotales.classList.add("alcanzado");
    }
  }

  function pintarSelect() {
    const elegido = duenoInmueble.value;
    duenoInmueble.innerHTML = "";

    const vacio = document.createElement("option");
    vacio.value = "";
    vacio.textContent = "Elige un propietario";
    duenoInmueble.append(vacio);

    propietarios.forEach((p) => {
      const opcion = document.createElement("option");
      opcion.value = p.id;
      opcion.textContent = p.nombre;
      duenoInmueble.append(opcion);
    });

    if (elegido) duenoInmueble.value = elegido;
  }

  function pintarLista() {
    const texto = buscador.value.trim().toLowerCase();

    const visibles = propietarios.filter((p) => {
      if (!texto) return true;
      return (
        p.nombre.toLowerCase().includes(texto) ||
        p.id.toLowerCase().includes(texto) ||
        p.inmuebles.some((i) => i.nombre.toLowerCase().includes(texto))
      );
    });

    conteoLista.textContent =
      visibles.length + " de " + propietarios.length + " propietarios";

    lista.innerHTML = "";

    if (!visibles.length) {
      lista.innerHTML = '<p class="vacio">Nadie coincide con la búsqueda.</p>';
      return;
    }

    visibles.forEach((p) => {
      const fila = document.createElement("div");
      fila.className = "fila fila-columna";

      const cabecera = document.createElement("div");
      cabecera.className = "fila-cabecera";

      const info = document.createElement("div");
      info.className = "fila-info";

      const nombre = document.createElement("p");
      nombre.className = "fila-nombre";
      nombre.textContent = p.nombre;

      const meta = document.createElement("p");
      meta.className = "fila-meta";
      const partes = [p.id];
      partes.push(
        p.inmuebles.length +
          (p.inmuebles.length === 1 ? " inmueble" : " inmuebles"),
      );
      partes.push("Vota " + porcentaje(p.coeficiente) + "%");
      if (p.apoderados.length) {
        partes.push(
          "Apoderado: " + p.apoderados.map((a) => a.nombre || a.identificacion).join(", "),
        );
      }
      meta.textContent = partes.join("  ·  ");

      info.append(nombre, meta);

      const acciones = document.createElement("div");
      acciones.className = "fila-acciones";
      acciones.append(
        botonMini("Agregar inmueble", () => {
          limpiarInmueble();
          duenoInmueble.value = p.id;
          nombreInmueble.focus();
          nombreInmueble.scrollIntoView({ behavior: "smooth", block: "center" });
        }),
        botonMini("Editar", () => cargarPropietario(p)),
        botonMini("Eliminar", () => eliminarPropietario(p), "peligro"),
      );

      cabecera.append(info, acciones);
      fila.append(cabecera);

      if (p.inmuebles.length) {
        const sublista = document.createElement("div");
        sublista.className = "sublista";

        p.inmuebles.forEach((i) => {
          const item = document.createElement("div");
          item.className = "subfila";

          const datos = document.createElement("div");
          datos.className = "fila-info";

          const titulo = document.createElement("p");
          titulo.className = "fila-nombre";
          titulo.textContent = i.nombre;

          const detalle = document.createElement("p");
          detalle.className = "fila-meta";
          detalle.textContent =
            i.tipo +
            "  ·  RPH " +
            porcentaje(i.coefRPH) +
            "%  ·  " +
            (i.coefVoto > 0
              ? "vota " + porcentaje(i.coefVoto) + "%"
              : "consolidado, no vota aparte");

          datos.append(titulo, detalle);

          const botones = document.createElement("div");
          botones.className = "fila-acciones";
          botones.append(
            botonMini("Editar", () => cargarInmueble(i)),
            botonMini("Quitar", () => eliminarInmueble(i), "peligro"),
          );

          item.append(datos, botones);
          sublista.append(item);
        });

        fila.append(sublista);
      } else {
        const vacio = document.createElement("p");
        vacio.className = "fila-meta";
        vacio.textContent = "Sin inmuebles asignados: no cuenta para el quórum.";
        fila.append(vacio);
      }

      lista.append(fila);
    });
  }

  function recomponer() {
    const porDueno = {};

    inmuebles.forEach((i) => {
      if (!porDueno[i.propietarioId]) porDueno[i.propietarioId] = [];
      porDueno[i.propietarioId].push(i);
    });

    Object.values(porDueno).forEach((grupo) => {
      grupo.sort((a, b) => {
        const pesoA = ORDEN_TIPO[a.tipo] === undefined ? 9 : ORDEN_TIPO[a.tipo];
        const pesoB = ORDEN_TIPO[b.tipo] === undefined ? 9 : ORDEN_TIPO[b.tipo];
        if (pesoA !== pesoB) return pesoA - pesoB;
        return a.nombre.localeCompare(b.nombre, "es", { numeric: true });
      });
    });

    propietarios.forEach((p) => {
      p.inmuebles = porDueno[p.id] || [];
      p.coeficiente = p.inmuebles.reduce((s, i) => s + i.coefVoto, 0);
    });

    pintarTotales();
    pintarSelect();
    pintarLista();
  }

  /* ---------- Escucha en vivo ---------- */

  onValue(
    ref(db, "propietarios"),
    (snapshot) => {
      propietarios = [];

      snapshot.forEach((hijo) => {
        const datos = hijo.val();
        if (!datos) return;

        propietarios.push({
          id: hijo.key,
          nombre: String(datos.nombre || hijo.key),
          apoderados: apoderadosDe(datos),
          inmuebles: [],
          coeficiente: 0,
        });
      });

      propietarios.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      recomponer();
    },
    (e) => {
      console.error(e);
      lista.innerHTML =
        '<p class="vacio">No se pudieron cargar los propietarios. Revisa las reglas de la base de datos.</p>';
    },
  );

  onValue(ref(db, "inmuebles"), (snapshot) => {
    inmuebles = [];

    snapshot.forEach((hijo) => {
      const datos = hijo.val();
      if (!datos) return;

      inmuebles.push({
        clave: hijo.key,
        nombre: String(datos.nombre || hijo.key),
        tipo: String(datos.tipo || ""),
        coefRPH: Number(datos.coeficienteRPH) || 0,
        coefVoto: Number(datos.coeficienteVoto) || 0,
        propietarioId: String(datos.propietarioId || ""),
      });
    });

    recomponer();
  });

  /* ---------- Eventos ---------- */

  btnGuardarPropietario.addEventListener("click", guardarPropietario);
  btnCancelarPropietario.addEventListener("click", limpiarPropietario);
  btnGuardarInmueble.addEventListener("click", guardarInmueble);
  btnCancelarInmueble.addEventListener("click", limpiarInmueble);
  buscador.addEventListener("input", pintarLista);

  limpiarPropietario();
  limpiarInmueble();
}

const sesion = leerSesion();
if (sesion && sesion.type === "0") {
  iniciarPropietarios();
}