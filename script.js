import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  update,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBMNSjmM7sHC184DiMzzm8GmmMKTve4Ufc",
  authDomain: "coloquio-forms.firebaseapp.com",
  databaseURL: "https://coloquio-forms-default-rtdb.firebaseio.com",
  projectId: "coloquio-forms",
  storageBucket: "coloquio-forms.firebasestorage.app",
  messagingSenderId: "170188483453",
  appId: "1:170188483453:web:bddbe9d3ab358b70947a14",
  measurementId: "G-70YCGNV82V",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

const CLAVE_SESION = "sesion";
const QUORUM_MINIMO = 0.5; // se inicia con más del 50% del coeficiente
const PAGINAS_ADMIN = ["dashboard", "apoderados", "preguntas", "reporte"];

function guardarSesion(datos) {
  sessionStorage.setItem(CLAVE_SESION, JSON.stringify(datos));
}

export function leerSesion() {
  const guardado = sessionStorage.getItem(CLAVE_SESION);
  return guardado ? JSON.parse(guardado) : null;
}

function cerrarSesion() {
  sessionStorage.removeItem(CLAVE_SESION);
  window.location.href = "index.html";
}

function porcentaje(valor) {
  return (valor * 100).toFixed(2);
}

function fechaLegible(marca) {
  if (!marca) return "";
  return new Date(Number(marca)).toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ---------- Apoderados ----------
   En la base hay dos formas del dato:
   - apoderado: "NOMBRE"            → viejo, solo el nombre, no permite entrar
   - apoderados: [{ identificacion, nombre }] → el que sirve para el ingreso
   Esta función devuelve siempre la lista con cédula. */

export function apoderadosDe(propietario) {
  if (!propietario) return [];

  const crudos = Array.isArray(propietario.apoderados)
    ? propietario.apoderados
    : Object.values(propietario.apoderados || {});

  return crudos
    .filter((a) => a && a.identificacion)
    .map((a) => ({
      identificacion: String(a.identificacion).trim(),
      nombre: String(a.nombre || "").trim(),
    }));
}

// Para mostrar en pantalla: junta el campo viejo con los nombres de la lista.
export function nombresApoderados(propietario) {
  const nombres = apoderadosDe(propietario).map(
    (a) => a.nombre || a.identificacion,
  );

  const viejo = String((propietario && propietario.apoderado) || "").trim();
  if (viejo && !nombres.includes(viejo)) nombres.unshift(viejo);

  return nombres;
}

/* ---------- Login ---------- */

// Si la cédula no está en usuarios, puede ser la de un apoderado.
// La contraseña de un apoderado es su propia cédula.
async function buscarComoApoderado(user, password) {
  if (user !== password) return null;

  const snapshot = await get(ref(db, "propietarios"));
  let encontrado = null;

  snapshot.forEach((hijo) => {
    apoderadosDe(hijo.val()).forEach((a) => {
      if (a.identificacion === user) {
        encontrado = { id: user, user: user, type: "1" };
      }
    });
  });

  return encontrado;
}

async function iniciarLogin() {
  const inputUser = document.getElementById("user");
  const inputPassword = document.getElementById("password");
  const boton = document.getElementById("btnIngresar");
  const error = document.getElementById("error");

  function mostrarError(mensaje) {
    error.textContent = mensaje;
    error.hidden = false;
  }

  async function ingresar() {
    error.hidden = true;

    const user = inputUser.value.trim();
    const password = inputPassword.value.trim();

    if (!user || !password) {
      mostrarError("Escribe tu usuario y tu contraseña.");
      return;
    }

    boton.disabled = true;
    boton.textContent = "Verificando...";

    try {
      const resultado = await get(ref(db, "usuarios"));

      let encontrado = null;

      resultado.forEach((hijo) => {
        const datos = hijo.val();
        if (!datos) return;

        if (
          String(datos.user).trim() === user &&
          String(datos.password).trim() === password
        ) {
          encontrado = {
            id: hijo.key,
            user: String(datos.user),
            type: String(datos.type),
          };
        }
      });

      if (!encontrado) {
        encontrado = await buscarComoApoderado(user, password);
      }

      if (!encontrado) {
        mostrarError("Usuario o contraseña incorrectos.");
        return;
      }

      guardarSesion(encontrado);

      window.location.href =
        encontrado.type === "0" ? "dashboard.html" : "forms.html";
    } catch (e) {
      console.error(e);
      mostrarError(
        "No se pudo conectar con la base de datos. Intenta de nuevo.",
      );
    } finally {
      boton.disabled = false;
      boton.textContent = "Ingresar";
    }
  }

  boton.addEventListener("click", ingresar);
  [inputUser, inputPassword].forEach((campo) => {
    campo.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter") ingresar();
    });
  });
}

/* ---------- Dashboard: toma de asistencia ---------- */

async function iniciarDashboard(sesion) {
  const lista = document.getElementById("lista");
  const buscador = document.getElementById("buscador");
  const conteoLista = document.getElementById("conteoLista");

  const cifraQuorum = document.getElementById("cifraQuorum");
  const progreso = document.querySelector(".progreso");
  const progresoRelleno = document.getElementById("progresoRelleno");
  const estadoQuorum = document.getElementById("estadoQuorum");
  const metricaPresentes = document.getElementById("metricaPresentes");
  const metricaUnidades = document.getElementById("metricaUnidades");
  const metricaFalta = document.getElementById("metricaFalta");

  lista.innerHTML = '<p class="vacio">Cargando propietarios...</p>';

  // Los inmuebles no cambian durante la asamblea: se leen una sola vez.
  const snapInmuebles = await get(ref(db, "inmuebles"));

  const unidadesPorPropietario = {};

  snapInmuebles.forEach((hijo) => {
    const inmueble = hijo.val();
    if (!inmueble) return;

    const coef = Number(inmueble.coeficienteVoto) || 0;

    const dueno = String(inmueble.propietarioId || "");
    if (!unidadesPorPropietario[dueno]) {
      unidadesPorPropietario[dueno] = { coeficiente: 0, nombres: [] };
    }
    unidadesPorPropietario[dueno].coeficiente += coef;
    if (coef > 0) {
      unidadesPorPropietario[dueno].nombres.push(String(inmueble.nombre));
    }
  });

  let propietarios = [];
  let filtro = "";
  const detallesAbiertos = {}; // se conserva al repintar por la escucha en vivo

  function pintarQuorum() {
    const presentes = propietarios.filter((p) => p.asistio);
    const acumulado = presentes.reduce((suma, p) => suma + p.coeficiente, 0);
    const unidades = presentes.reduce((suma, p) => suma + p.nombres.length, 0);
    const alcanzado = acumulado > QUORUM_MINIMO;

    cifraQuorum.innerHTML = porcentaje(acumulado) + "<span>%</span>";
    progresoRelleno.style.width = Math.min(acumulado * 100, 100) + "%";
    progreso.classList.toggle("alcanzado", alcanzado);
    estadoQuorum.classList.toggle("alcanzado", alcanzado);

    if (alcanzado) {
      estadoQuorum.textContent = "Hay quórum. La reunión puede iniciar.";
      metricaFalta.textContent = "—";
    } else {
      estadoQuorum.textContent =
        "Aún no hay quórum. Se necesita más del 50% del coeficiente.";
      metricaFalta.textContent = porcentaje(QUORUM_MINIMO - acumulado) + "%";
    }

    metricaPresentes.textContent =
      presentes.length + " / " + propietarios.length;
    metricaUnidades.textContent = unidades;
  }

  async function alternar(propietario, boton) {
    boton.disabled = true;

    const marcando = !propietario.asistio;

    try {
      await update(ref(db, "propietarios/" + propietario.id), {
        asistio: marcando,
        // Al desmarcar se limpia el rastro, así la persona puede volver
        // a registrarse sola si entra otra vez a su vista.
        registroAsistencia: marcando ? Date.now() : null,
        registradoPor: marcando
          ? {
              identificacion: sesion.user,
              nombre: sesion.user,
              tipo: "administracion",
            }
          : null,
      });
    } catch (e) {
      console.error(e);
      alert(
        "No se pudo guardar el registro. Revisa la conexión e intenta otra vez.",
      );
      boton.disabled = false;
    }
  }

  function bloqueDetalle(p) {
    const detalle = document.createElement("div");
    detalle.className = "detalle";
    detalle.hidden = !detallesAbiertos[p.id];

    function linea(texto, apagado) {
      const parrafo = document.createElement("p");
      parrafo.className = "detalle-linea" + (apagado ? " apagado" : "");
      parrafo.textContent = texto;
      detalle.append(parrafo);
    }

    if (!p.asistio) {
      linea("Sin registrar. Nadie ha ingresado por este inmueble.", true);
    } else if (p.registradoPor && p.registradoPor.tipo === "apoderado") {
      linea(
        "Ingresó " +
          (p.registradoPor.nombre || p.registradoPor.identificacion) +
          ", apoderado del propietario.",
      );
      linea("Cédula del apoderado: " + p.registradoPor.identificacion, true);
    } else if (p.registradoPor && p.registradoPor.tipo === "propietario") {
      linea("Ingresó el propietario en persona.");
      linea("Cédula: " + p.registradoPor.identificacion, true);
    } else if (p.registradoPor && p.registradoPor.tipo === "administracion") {
      linea("Marcado a mano por la administración (" + p.registradoPor.nombre + ").");
    } else {
      linea("Presente. No quedó registrado quién hizo el ingreso.", true);
    }

    if (p.registroAsistencia) {
      linea("Hora del registro: " + fechaLegible(p.registroAsistencia), true);
    }

    if (p.listaApoderados.length) {
      linea(
        "Apoderados autorizados: " +
          p.listaApoderados
            .map((a) => (a.nombre || "sin nombre") + " (" + a.identificacion + ")")
            .join("  ·  "),
        true,
      );
    } else if (p.apoderadoViejo) {
      linea(
        "Apoderado sin cédula registrada: " +
          p.apoderadoViejo +
          " — no puede ingresar hasta registrarlo.",
        true,
      );
    } else {
      linea("Sin apoderados registrados.", true);
    }

    return detalle;
  }

  function pintarLista() {
    const texto = filtro.trim().toLowerCase();

    const visibles = propietarios.filter((p) => {
      if (!texto) return true;
      return (
        p.nombre.toLowerCase().includes(texto) ||
        p.id.toLowerCase().includes(texto) ||
        p.nombres.join(" ").toLowerCase().includes(texto) ||
        p.apoderados.toLowerCase().includes(texto) ||
        p.cedulasApoderados.join(" ").includes(texto)
      );
    });

    conteoLista.textContent =
      visibles.length + " de " + propietarios.length + " propietarios";

    lista.innerHTML = "";

    if (!visibles.length) {
      lista.innerHTML =
        '<p class="vacio">Ningún propietario coincide con la búsqueda.</p>';
      return;
    }

    visibles.forEach((p) => {
      const fila = document.createElement("div");
      fila.className = "fila fila-columna" + (p.asistio ? " presente" : "");

      const cabecera = document.createElement("div");
      cabecera.className = "fila-cabecera";

      const info = document.createElement("div");
      info.className = "fila-info";

      const nombre = document.createElement("p");
      nombre.className = "fila-nombre";
      nombre.textContent = p.nombre || "(sin nombre)";

      const meta = document.createElement("p");
      meta.className = "fila-meta";
      const partes = [p.id];
      if (p.nombres.length) partes.push(p.nombres.join(", "));
      if (p.apoderados) partes.push("Apoderado: " + p.apoderados);
      meta.textContent = partes.join("  ·  ");

      info.append(nombre, meta);

      // Si entró un apoderado, se dice aquí mismo sin abrir el detalle.
      if (p.asistio && p.registradoPor && p.registradoPor.tipo === "apoderado") {
        const sello = document.createElement("span");
        sello.className = "sello apoderado";
        sello.textContent =
          "Representado por " +
          (p.registradoPor.nombre || p.registradoPor.identificacion);
        info.append(sello);
      }

      const coef = document.createElement("span");
      coef.className = "fila-coef";
      coef.textContent = porcentaje(p.coeficiente) + "%";

      const detalle = bloqueDetalle(p);

      const verDetalle = document.createElement("button");
      verDetalle.type = "button";
      verDetalle.className = "btn-mini";
      verDetalle.textContent = detalle.hidden ? "Detalle" : "Ocultar";
      verDetalle.addEventListener("click", () => {
        detalle.hidden = !detalle.hidden;
        detallesAbiertos[p.id] = !detalle.hidden;
        verDetalle.textContent = detalle.hidden ? "Detalle" : "Ocultar";
      });

      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "marcar" + (p.asistio ? " presente" : "");
      boton.textContent = p.asistio ? "Presente" : "Marcar";
      boton.setAttribute("aria-pressed", String(p.asistio));
      boton.addEventListener("click", () => alternar(p, boton));

      const acciones = document.createElement("div");
      acciones.className = "fila-acciones";
      acciones.append(verDetalle, boton);

      cabecera.append(info, coef, acciones);
      fila.append(cabecera, detalle);
      lista.append(fila);
    });
  }

  // Escucha en vivo: si otro superadmin marca, esta vista se actualiza sola.
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
          nombre: String(datos.nombre || ""),
          apoderados: nombresApoderados(datos).join(", "),
          listaApoderados: apoderadosDe(datos),
          cedulasApoderados: apoderadosDe(datos).map((a) => a.identificacion),
          apoderadoViejo: String(datos.apoderado || "").trim(),
          asistio: datos.asistio === true,
          registroAsistencia: datos.registroAsistencia || 0,
          registradoPor: datos.registradoPor || null,
          coeficiente: unidades.coeficiente,
          nombres: unidades.nombres,
        });
      });

      propietarios.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

      pintarQuorum();
      pintarLista();
    },
    (error) => {
      console.error(error);
      lista.innerHTML =
        '<p class="vacio">No se pudieron cargar los propietarios. Revisa las reglas de la base de datos.</p>';
    },
  );

  buscador.addEventListener("input", () => {
    filtro = buscador.value;
    pintarLista();
  });
}

/* ---------- Vistas internas ---------- */

function iniciarVista(pagina) {
  const sesion = leerSesion();

  if (!sesion) {
    window.location.href = "index.html";
    return;
  }

  if (PAGINAS_ADMIN.includes(pagina) && sesion.type !== "0") {
    window.location.href = "forms.html";
    return;
  }

  document.getElementById("usuarioActivo").textContent = sesion.user;
  document.getElementById("btnSalir").addEventListener("click", cerrarSesion);

  if (pagina === "dashboard") {
    iniciarDashboard(sesion);
  }
}

/* ---------- Arranque ---------- */

const pagina = document.body.dataset.pagina;

if (pagina === "login") {
  iniciarLogin();
} else {
  iniciarVista(pagina);
}