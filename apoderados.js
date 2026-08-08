// CRUD de apoderados: quién puede entrar en representación de cada propietario.
// Se guarda en propietarios/<id>/apoderados como lista de { identificacion, nombre }.
import { db, leerSesion, apoderadosDe } from "./script.js";
import {
  ref,
  get,
  set,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

function porcentaje(valor) {
  return (valor * 100).toFixed(2);
}

async function iniciarApoderados() {
  const selectPropietario = document.getElementById("propietario");
  const inputCedula = document.getElementById("cedula");
  const inputNombre = document.getElementById("nombre");
  const error = document.getElementById("errorApoderado");
  const nota = document.getElementById("notaApoderado");
  const btnGuardar = document.getElementById("btnGuardar");
  const btnCancelar = document.getElementById("btnCancelar");
  const tituloFormulario = document.getElementById("tituloFormulario");
  const buscador = document.getElementById("buscador");
  const soloConApoderado = document.getElementById("soloConApoderado");
  const conteoLista = document.getElementById("conteoLista");
  const lista = document.getElementById("lista");

  lista.innerHTML = '<p class="vacio">Cargando propietarios...</p>';

  /* ----- Inmuebles: solo para mostrar unidades y coeficiente ----- */

  const snapInmuebles = await get(ref(db, "inmuebles"));
  const unidadesPorPropietario = {};

  snapInmuebles.forEach((hijo) => {
    const inmueble = hijo.val();
    if (!inmueble) return;

    const dueno = String(inmueble.propietarioId || "");
    const coef = Number(inmueble.coeficienteVoto) || 0;

    if (!unidadesPorPropietario[dueno]) {
      unidadesPorPropietario[dueno] = { coeficiente: 0, nombres: [] };
    }
    unidadesPorPropietario[dueno].coeficiente += coef;
    if (coef > 0) unidadesPorPropietario[dueno].nombres.push(String(inmueble.nombre));
  });

  let propietarios = [];
  let editando = null; // { propietarioId, indice }

  /* ----- Formulario ----- */

  function mostrarError(mensaje) {
    error.textContent = mensaje;
    error.hidden = false;
  }

  function limpiarFormulario() {
    editando = null;
    inputCedula.value = "";
    inputNombre.value = "";
    error.hidden = true;
    nota.hidden = true;
    tituloFormulario.textContent = "Nuevo apoderado";
    btnGuardar.textContent = "Guardar apoderado";
    btnCancelar.hidden = true;
  }

  function cargarEnFormulario(propietario, apoderado, indice) {
    editando = { propietarioId: propietario.id, indice: indice };
    selectPropietario.value = propietario.id;
    inputCedula.value = apoderado.identificacion;
    inputNombre.value = apoderado.nombre;
    error.hidden = true;
    nota.hidden = true;
    tituloFormulario.textContent = "Editando apoderado";
    btnGuardar.textContent = "Guardar cambios";
    btnCancelar.hidden = false;
    inputCedula.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Reescribe la lista completa del propietario: es un nodo pequeño y así
  // no quedan huecos en los índices al borrar uno del medio.
  async function escribirLista(propietarioId, apoderados) {
    await set(
      ref(db, "propietarios/" + propietarioId + "/apoderados"),
      apoderados.length ? apoderados : null,
    );
  }

  async function guardar() {
    error.hidden = true;
    nota.hidden = true;

    const propietarioId = selectPropietario.value;
    const cedula = inputCedula.value.trim();
    const nombre = inputNombre.value.trim();

    if (!propietarioId) {
      mostrarError("Elige a qué propietario representa.");
      return;
    }

    if (!cedula) {
      mostrarError("Escribe la cédula del apoderado.");
      return;
    }

    if (cedula === propietarioId) {
      mostrarError(
        "Esa es la cédula del propio propietario: él ya entra con su usuario.",
      );
      return;
    }

    const propietario = propietarios.find((p) => p.id === propietarioId);
    if (!propietario) {
      mostrarError("Ese propietario ya no existe. Recarga la página.");
      return;
    }

    const repetida = propietario.apoderados.some(
      (a, i) =>
        a.identificacion === cedula &&
        !(editando && editando.propietarioId === propietarioId && editando.indice === i),
    );

    if (repetida) {
      mostrarError("Esa cédula ya está registrada como apoderado de este propietario.");
      return;
    }

    btnGuardar.disabled = true;

    try {
      const nuevos = propietario.apoderados.slice();
      const registro = { identificacion: cedula, nombre: nombre };

      if (editando && editando.propietarioId === propietarioId) {
        nuevos[editando.indice] = registro;
      } else {
        nuevos.push(registro);

        // Si se estaba editando y cambió de propietario, hay que sacarlo del anterior.
        if (editando) {
          const anterior = propietarios.find((p) => p.id === editando.propietarioId);
          if (anterior) {
            const restantes = anterior.apoderados.filter(
              (a, i) => i !== editando.indice,
            );
            await escribirLista(anterior.id, restantes);
          }
        }
      }

      await escribirLista(propietarioId, nuevos);

      // Aviso útil, no un error: si además es propietario, se le suman coeficientes.
      const tambienPropietario = propietarios.find((p) => p.id === cedula);
      if (tambienPropietario) {
        nota.textContent =
          "Esa cédula también es propietaria (" +
          tambienPropietario.nombre +
          "). Al entrar votará por ambos y se le suman los coeficientes.";
        nota.hidden = false;
      }

      limpiarFormulario();
      if (tambienPropietario) nota.hidden = false;
    } catch (e) {
      console.error(e);
      mostrarError("No se pudo guardar. Revisa la conexión e intenta otra vez.");
    } finally {
      btnGuardar.disabled = false;
    }
  }

  async function eliminar(propietario, indice) {
    const apoderado = propietario.apoderados[indice];
    const seguro = confirm(
      "¿Quitar a " +
        (apoderado.nombre || apoderado.identificacion) +
        " como apoderado de " +
        propietario.nombre +
        "?",
    );
    if (!seguro) return;

    try {
      await escribirLista(
        propietario.id,
        propietario.apoderados.filter((a, i) => i !== indice),
      );

      if (editando && editando.propietarioId === propietario.id) limpiarFormulario();
    } catch (e) {
      console.error(e);
      alert("No se pudo quitar el apoderado.");
    }
  }

  /* ----- Lista ----- */

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
      const opcion = document.createElement("option");
      opcion.value = p.id;
      opcion.textContent =
        p.nombre + (p.unidades.length ? " — " + p.unidades.join(", ") : "");
      selectPropietario.append(opcion);
    });

    if (elegido) selectPropietario.value = elegido;
  }

  function pintarLista() {
    const texto = buscador.value.trim().toLowerCase();

    const visibles = propietarios.filter((p) => {
      if (soloConApoderado.checked && !p.apoderados.length) return false;
      if (!texto) return true;

      return (
        p.nombre.toLowerCase().includes(texto) ||
        p.id.toLowerCase().includes(texto) ||
        p.unidades.join(" ").toLowerCase().includes(texto) ||
        p.apoderados.some(
          (a) =>
            a.identificacion.toLowerCase().includes(texto) ||
            a.nombre.toLowerCase().includes(texto),
        )
      );
    });

    const conApoderado = propietarios.filter((p) => p.apoderados.length).length;
    conteoLista.textContent =
      visibles.length +
      " de " +
      propietarios.length +
      " propietarios  ·  " +
      conApoderado +
      " con apoderado";

    lista.innerHTML = "";

    if (!visibles.length) {
      lista.innerHTML = '<p class="vacio">Ningún propietario coincide.</p>';
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
      if (p.unidades.length) partes.push(p.unidades.join(", "));
      partes.push(porcentaje(p.coeficiente) + "%");
      meta.textContent = partes.join("  ·  ");

      info.append(nombre, meta);

      const agregar = botonMini("Agregar apoderado", () => {
        limpiarFormulario();
        selectPropietario.value = p.id;
        inputNombre.value = p.apoderadoViejo || "";
        inputCedula.focus();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      cabecera.append(info, agregar);
      fila.append(cabecera);

      if (p.apoderadoViejo) {
        const aviso = document.createElement("p");
        aviso.className = "fila-meta";
        aviso.textContent =
          "Apoderado del Excel sin cédula: " +
          p.apoderadoViejo +
          " — no puede ingresar hasta que se registre aquí.";
        fila.append(aviso);
      }

      if (p.apoderados.length) {
        const sublista = document.createElement("div");
        sublista.className = "sublista";

        p.apoderados.forEach((a, indice) => {
          const item = document.createElement("div");
          item.className = "subfila";

          const datos = document.createElement("div");
          datos.className = "fila-info";

          const quien = document.createElement("p");
          quien.className = "fila-nombre";
          quien.textContent = a.nombre || "(sin nombre)";

          const cedula = document.createElement("p");
          cedula.className = "fila-meta";
          cedula.textContent = "Cédula " + a.identificacion;

          datos.append(quien, cedula);

          const acciones = document.createElement("div");
          acciones.className = "fila-acciones";
          acciones.append(
            botonMini("Editar", () => cargarEnFormulario(p, a, indice)),
            botonMini("Quitar", () => eliminar(p, indice), "peligro"),
          );

          item.append(datos, acciones);
          sublista.append(item);
        });

        fila.append(sublista);
      }

      lista.append(fila);
    });
  }

  /* ----- Escucha en vivo ----- */

  onValue(
    ref(db, "propietarios"),
    (snapshot) => {
      propietarios = [];

      snapshot.forEach((hijo) => {
        const datos = hijo.val();
        if (!datos) return;

        const unidades = unidadesPorPropietario[hijo.key] || {
          coeficiente: 0,
          nombres: [],
        };

        propietarios.push({
          id: hijo.key,
          nombre: String(datos.nombre || hijo.key),
          apoderados: apoderadosDe(datos),
          apoderadoViejo: String(datos.apoderado || "").trim(),
          unidades: unidades.nombres,
          coeficiente: unidades.coeficiente,
        });
      });

      propietarios.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

      pintarSelect();
      pintarLista();
    },
    (e) => {
      console.error(e);
      lista.innerHTML =
        '<p class="vacio">No se pudieron cargar los propietarios. Revisa las reglas de la base de datos.</p>';
    },
  );

  /* ----- Eventos ----- */

  btnGuardar.addEventListener("click", guardar);
  btnCancelar.addEventListener("click", limpiarFormulario);
  buscador.addEventListener("input", pintarLista);
  soloConApoderado.addEventListener("change", pintarLista);

  [inputCedula, inputNombre].forEach((campo) => {
    campo.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter") guardar();
    });
  });

  limpiarFormulario();
}

const sesion = leerSesion();
if (sesion && sesion.type === "0") {
  iniciarApoderados();
}