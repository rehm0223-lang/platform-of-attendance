// Poderes por inmueble.
//
// Los apoderados se cuelgan del propietario, no del inmueble, así que para
// repartir el poder entre varias personas hay que separar al propietario en
// registros derivados: uno por cada grupo de inmuebles entregado.
//
//   9066266          → PEDRO MANUEL CALDERON MEJIA (el original)
//   9066266-205      → sus inmuebles 205 y PARQUEADERO-5, con su apoderado
//
// El usuario de la persona no se toca: el propietario original queda como
// apoderado de cada derivado, así que si aparece en persona lo representa todo.
import { db, leerSesion, apoderadosDe } from "./script.js";
import {
  ref,
  get,
  update,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const ORDEN_TIPO = { apartamento: 0, deposito: 1, parqueadero: 2 };
const MARCA = "-"; // separa la cédula del sufijo en los registros derivados

function porcentaje(valor) {
  return (valor * 100).toFixed(2);
}

// "9066266-205" → "9066266". Sirve para saber de quién salió un derivado.
function raizDe(id, existentes) {
  const corte = id.lastIndexOf(MARCA);
  if (corte <= 0) return null;

  const posible = id.slice(0, corte);
  return existentes.has(posible) ? posible : null;
}

function iniciarPoderes() {
  const selectPropietario = document.getElementById("propietario");
  const contenedorInmuebles = document.getElementById("inmuebles");
  const inputCedula = document.getElementById("cedula");
  const inputNombre = document.getElementById("nombre");
  const error = document.getElementById("errorPoder");
  const nota = document.getElementById("notaPoder");
  const btnOtorgar = document.getElementById("btnOtorgar");
  const conteoLista = document.getElementById("conteoLista");
  const lista = document.getElementById("lista");

  lista.innerHTML = '<p class="vacio">Cargando...</p>';

  let propietarios = [];
  let inmuebles = [];
  let porId = {};

  function mostrarError(mensaje) {
    error.textContent = mensaje;
    error.hidden = false;
  }

  function limpiar() {
    inputCedula.value = "";
    inputNombre.value = "";
    error.hidden = true;
    contenedorInmuebles.innerHTML =
      '<p class="ayuda">Elige primero un propietario.</p>';
    selectPropietario.value = "";
  }

  /* ---------- Otorgar ---------- */

  function inmueblesElegidos() {
    return Array.from(
      contenedorInmuebles.querySelectorAll("input:checked"),
    ).map((i) => i.value);
  }

  // Se numera con el primer inmueble elegido: 9066266-205, 9066266-302...
  function claveDerivada(origen, elegidos) {
    const base = origen + MARCA + elegidos[0];
    if (!porId[base]) return base;

    let n = 2;
    while (porId[base + MARCA + n]) n += 1;
    return base + MARCA + n;
  }

  async function otorgar() {
    error.hidden = true;
    nota.hidden = true;

    const origenId = selectPropietario.value;
    const elegidos = inmueblesElegidos();
    const cedula = inputCedula.value.replace(/[.\s]/g, "").trim();
    const nombre = inputNombre.value.trim();

    if (!origenId) {
      mostrarError("Elige el propietario que otorga el poder.");
      return;
    }

    if (!elegidos.length) {
      mostrarError("Marca al menos un inmueble.");
      return;
    }

    if (!cedula) {
      mostrarError("Escribe la cédula del apoderado.");
      return;
    }

    if (/[.#$[\]/]/.test(cedula)) {
      mostrarError("La cédula no puede llevar puntos ni los signos # $ [ ] /");
      return;
    }

    const origen = porId[origenId];

    if (cedula === origenId || cedula === origen.raiz) {
      mostrarError(
        "Esa es la cédula del propio propietario: él ya entra con su usuario.",
      );
      return;
    }

    const suyos = inmuebles.filter((i) => i.propietarioId === origenId);

    if (elegidos.length === suyos.length) {
      mostrarError(
        "Estás entregando todos sus inmuebles. Para eso registra un apoderado normal desde la vista de Apoderados.",
      );
      return;
    }

    btnOtorgar.disabled = true;

    try {
      // La cédula raíz del propietario, para que él siga representando lo suyo.
      const raiz = origen.raiz || origenId;
      const nombreLimpio = origen.nombre.split(" — ")[0];
      const etiqueta = elegidos.join(", ");
      const nuevoId = claveDerivada(raiz, elegidos);

      const cambios = {};

      cambios["propietarios/" + nuevoId] = {
        identificacion: nuevoId,
        nombre: nombreLimpio + " — " + etiqueta,
        asistio: false,
        apoderados: [
          { identificacion: cedula, nombre: nombre || cedula },
          { identificacion: raiz, nombre: nombreLimpio },
        ],
      };

      elegidos.forEach((clave) => {
        cambios["inmuebles/" + clave + "/propietarioId"] = nuevoId;
      });

      await update(ref(db), cambios);

      nota.textContent =
        (nombre || cedula) +
        " entra con " +
        cedula +
        " como usuario y como contraseña, y representa " +
        etiqueta +
        ".";
      nota.hidden = false;

      limpiar();
      nota.hidden = false;
    } catch (e) {
      console.error(e);
      mostrarError("No se pudo otorgar el poder. Revisa la conexión.");
    } finally {
      btnOtorgar.disabled = false;
    }
  }

  /* ---------- Revocar ---------- */

  async function revocar(derivado) {
    const destino = derivado.raiz;

    const seguro = confirm(
      "¿Revocar el poder y devolver " +
        derivado.inmuebles.map((i) => i.nombre).join(", ") +
        " al propietario original?",
    );
    if (!seguro) return;

    // Si el propietario original ya no existe (se revocó todo antes),
    // hay que recrearlo para no dejar los inmuebles huérfanos.
    const existeDestino = !!porId[destino];

    try {
      const cambios = {};

      if (!existeDestino) {
        const snapUsuario = await get(ref(db, "usuarios/" + destino));

        cambios["propietarios/" + destino] = {
          identificacion: destino,
          nombre: derivado.nombre.split(" — ")[0],
          asistio: false,
        };

        if (!snapUsuario.exists()) {
          cambios["usuarios/" + destino] = {
            user: destino,
            password: destino,
            type: "1",
          };
        }
      }

      derivado.inmuebles.forEach((i) => {
        cambios["inmuebles/" + i.clave + "/propietarioId"] = destino;
      });

      cambios["propietarios/" + derivado.id] = null;

      await update(ref(db), cambios);
    } catch (e) {
      console.error(e);
      alert("No se pudo revocar el poder.");
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

  function pintarSelect() {
    const elegido = selectPropietario.value;
    selectPropietario.innerHTML = "";

    const vacio = document.createElement("option");
    vacio.value = "";
    vacio.textContent = "Elige un propietario";
    selectPropietario.append(vacio);

    propietarios.forEach((p) => {
      // Con un solo inmueble no hay nada que repartir.
      if (p.inmuebles.length < 2) return;

      const opcion = document.createElement("option");
      opcion.value = p.id;
      opcion.textContent =
        p.nombre + " (" + p.inmuebles.length + " inmuebles)";
      selectPropietario.append(opcion);
    });

    if (elegido) selectPropietario.value = elegido;
  }

  function pintarInmuebles() {
    const p = porId[selectPropietario.value];
    contenedorInmuebles.innerHTML = "";

    if (!p) {
      contenedorInmuebles.innerHTML =
        '<p class="ayuda">Elige primero un propietario.</p>';
      return;
    }

    p.inmuebles.forEach((i) => {
      const etiqueta = document.createElement("label");
      etiqueta.className = "check";

      const control = document.createElement("input");
      control.type = "checkbox";
      control.value = i.clave;

      const texto = document.createElement("span");
      texto.textContent =
        i.nombre +
        "  ·  " +
        (i.coefVoto > 0
          ? porcentaje(i.coefVoto) + "%"
          : "consolidado, no vota aparte");

      etiqueta.append(control, texto);
      contenedorInmuebles.append(etiqueta);
    });

    const ayuda = document.createElement("p");
    ayuda.className = "ayuda";
    ayuda.textContent =
      "Marca los inmuebles que entrega. Los que no marques siguen con " +
      p.nombre.split(" — ")[0] + ".";
    contenedorInmuebles.append(ayuda);
  }

  function pintarLista() {
    const derivados = propietarios.filter((p) => p.raiz);

    conteoLista.textContent =
      derivados.length === 1
        ? "1 poder otorgado"
        : derivados.length + " poderes otorgados";

    lista.innerHTML = "";

    if (!derivados.length) {
      lista.innerHTML =
        '<p class="vacio">No hay poderes por inmueble. Todos los propietarios representan sus unidades completas.</p>';
      return;
    }

    // Agrupados por el propietario del que salieron.
    const grupos = {};
    derivados.forEach((d) => {
      if (!grupos[d.raiz]) grupos[d.raiz] = [];
      grupos[d.raiz].push(d);
    });

    Object.keys(grupos).forEach((raiz) => {
      const fila = document.createElement("div");
      fila.className = "fila fila-columna";

      const original = porId[raiz];
      const nombreOriginal = original
        ? original.nombre
        : grupos[raiz][0].nombre.split(" — ")[0];

      const cabecera = document.createElement("div");
      cabecera.className = "fila-cabecera";

      const info = document.createElement("div");
      info.className = "fila-info";

      const titulo = document.createElement("p");
      titulo.className = "fila-nombre";
      titulo.textContent = nombreOriginal;

      const meta = document.createElement("p");
      meta.className = "fila-meta";
      const partes = [];
      if (original && original.inmuebles.length) {
        partes.push(
          "Conserva: " + original.inmuebles.map((i) => i.nombre).join(", "),
        );
      } else {
        partes.push("Entregó todos sus inmuebles");
      }
      partes.push(grupos[raiz].length + " poder(es)");
      meta.textContent = partes.join("  ·  ");

      info.append(titulo, meta);
      cabecera.append(info);
      fila.append(cabecera);

      const sublista = document.createElement("div");
      sublista.className = "sublista";

      grupos[raiz].forEach((d) => {
        const item = document.createElement("div");
        item.className = "subfila";

        const datos = document.createElement("div");
        datos.className = "fila-info";

        // El primer apoderado es el que recibió el poder; el segundo es el dueño.
        const quien = d.apoderados[0];

        const nombre = document.createElement("p");
        nombre.className = "fila-nombre";
        nombre.textContent = quien
          ? quien.nombre || quien.identificacion
          : "(sin apoderado)";

        const detalle = document.createElement("p");
        detalle.className = "fila-meta";
        detalle.textContent =
          d.inmuebles.map((i) => i.nombre).join(", ") +
          "  ·  vota " +
          porcentaje(d.coeficiente) +
          "%" +
          (d.asistio ? "  ·  presente" : "");

        datos.append(nombre, detalle);

        const botones = document.createElement("div");
        botones.className = "fila-acciones";
        botones.append(botonMini("Revocar", () => revocar(d), "peligro"));

        item.append(datos, botones);
        sublista.append(item);
      });

      fila.append(sublista);
      lista.append(fila);
    });
  }

  function recomponer() {
    const existentes = new Set(propietarios.map((p) => p.id));
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

    porId = {};

    propietarios.forEach((p) => {
      p.inmuebles = porDueno[p.id] || [];
      p.coeficiente = p.inmuebles.reduce((s, i) => s + i.coefVoto, 0);
      p.raiz = raizDe(p.id, existentes) || raizDeHuerfano(p.id, existentes);
      porId[p.id] = p;
    });

    pintarSelect();
    pintarInmuebles();
    pintarLista();
  }

  // Si el propietario original ya no existe, igual se reconoce el derivado
  // por la forma de la llave: cédula + guion + nombre de inmueble.
  function raizDeHuerfano(id, existentes) {
    const corte = id.lastIndexOf(MARCA);
    if (corte <= 0) return null;

    const posible = id.slice(0, corte);
    const sufijo = id.slice(corte + 1);

    // Los NIT llevan guion de verificación: 900856338-2 no es un derivado.
    if (/^\d$/.test(sufijo)) return null;

    return inmuebles.some((i) => i.clave === sufijo) ? posible : null;
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
          asistio: datos.asistio === true,
          inmuebles: [],
          coeficiente: 0,
          raiz: null,
        });
      });

      propietarios.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      recomponer();
    },
    (e) => {
      console.error(e);
      lista.innerHTML =
        '<p class="vacio">No se pudieron cargar los propietarios.</p>';
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
        coefVoto: Number(datos.coeficienteVoto) || 0,
        propietarioId: String(datos.propietarioId || ""),
      });
    });

    recomponer();
  });

  /* ---------- Eventos ---------- */

  selectPropietario.addEventListener("change", pintarInmuebles);
  btnOtorgar.addEventListener("click", otorgar);

  [inputCedula, inputNombre].forEach((campo) => {
    campo.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter") otorgar();
    });
  });

  limpiar();
}

const sesion = leerSesion();
if (sesion && sesion.type === "0") {
  iniciarPoderes();
}