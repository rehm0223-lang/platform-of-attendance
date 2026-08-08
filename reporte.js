// Reporte de resultados: cruza preguntas, respuestas y coeficientes.
// Cada punto tiene dos pestañas: cuánto participó y cómo se calificó.
import { db, leerSesion } from "./script.js";
import {
  ref,
  get,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const COLORES = ["#0b6e5f", "#a63a2b", "#566a72", "#c58b2a", "#3e6b8a", "#7a5c99"];
const GRIS = "#c9d3d1";

function porcentaje(valor) {
  return (valor * 100).toFixed(2);
}

/* Dona en SVG: cada tramo es un arco del anillo. El truco es un círculo de
   circunferencia 100, así el dasharray se escribe directo en porcentajes. */
function dona(tramos) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 42 42");
  svg.setAttribute("class", "dona");

  const fondo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  fondo.setAttribute("cx", "21");
  fondo.setAttribute("cy", "21");
  fondo.setAttribute("r", "15.91549");
  fondo.setAttribute("fill", "none");
  fondo.setAttribute("stroke", "#e7ebea");
  fondo.setAttribute("stroke-width", "6");
  svg.append(fondo);

  let acumulado = 0;

  tramos.forEach((tramo) => {
    const parte = tramo.fraccion * 100;
    if (parte <= 0) return;

    const arco = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    arco.setAttribute("cx", "21");
    arco.setAttribute("cy", "21");
    arco.setAttribute("r", "15.91549");
    arco.setAttribute("fill", "none");
    arco.setAttribute("stroke", tramo.color);
    arco.setAttribute("stroke-width", "6");
    arco.setAttribute("stroke-dasharray", parte + " " + (100 - parte));
    arco.setAttribute("stroke-dashoffset", String(25 - acumulado));
    svg.append(arco);

    acumulado += parte;
  });

  return svg;
}

function anilloCon(tramos, cifra, etiqueta) {
  const anillo = document.createElement("div");
  anillo.className = "anillo";
  anillo.append(dona(tramos));

  const centro = document.createElement("div");
  centro.className = "anillo-centro";

  const fuerte = document.createElement("strong");
  fuerte.textContent = cifra;

  const pie = document.createElement("span");
  pie.textContent = etiqueta;

  centro.append(fuerte, pie);
  anillo.append(centro);
  return anillo;
}

function tabla(cabeceras, filas) {
  const elemento = document.createElement("table");
  elemento.className = "cuadro";

  const cabeza = document.createElement("thead");
  const trCabeza = document.createElement("tr");

  cabeceras.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c.texto;
    if (c.num) th.className = "num";
    trCabeza.append(th);
  });

  cabeza.append(trCabeza);
  elemento.append(cabeza);

  const cuerpo = document.createElement("tbody");

  filas.forEach((fila) => {
    const tr = document.createElement("tr");
    if (fila.destacada) tr.className = "mayoria";

    fila.celdas.forEach((celda) => {
      const td = document.createElement("td");
      if (celda.num) td.className = "num";

      if (celda.color) {
        const punto = document.createElement("span");
        punto.className = "punto";
        punto.style.background = celda.color;
        td.append(punto);
      }

      td.append(document.createTextNode(celda.texto));
      if (celda.nota) {
        const nota = document.createElement("span");
        nota.className = "apoderado-nota";
        nota.textContent = celda.nota;
        td.append(nota);
      }

      tr.append(td);
    });

    cuerpo.append(tr);
  });

  elemento.append(cuerpo);
  return elemento;
}

async function iniciarReporte() {
  const contenedor = document.getElementById("reporte");
  const resumen = document.getElementById("resumen");

  /* ----- Datos que no cambian durante la asamblea ----- */

  const [snapInmuebles, snapPropietarios] = await Promise.all([
    get(ref(db, "inmuebles")),
    get(ref(db, "propietarios")),
  ]);

  const coeficientePorPropietario = {};

  snapInmuebles.forEach((hijo) => {
    const inmueble = hijo.val();
    if (!inmueble) return;

    const dueno = String(inmueble.propietarioId || "");
    const coef = Number(inmueble.coeficienteVoto) || 0;
    coeficientePorPropietario[dueno] =
      (coeficientePorPropietario[dueno] || 0) + coef;
  });

  const propietarios = {};

  snapPropietarios.forEach((hijo) => {
    const datos = hijo.val();
    if (!datos) return;

    propietarios[hijo.key] = {
      id: hijo.key,
      nombre: String(datos.nombre || hijo.key),
      coeficiente: coeficientePorPropietario[hijo.key] || 0,
    };
  });

  const totalPropietarios = Object.keys(propietarios).length;

  // El coeficiente completo del edificio: contra esto se mide el quórum.
  const coeficienteEdificio = Object.values(propietarios).reduce(
    (suma, p) => suma + p.coeficiente,
    0,
  );

  /* ----- Datos que sí cambian ----- */

  let preguntas = [];
  let respuestas = {};

  // Se recuerda qué pestaña dejó abierta el admin en cada punto, para que
  // un voto entrante no lo devuelva a la primera.
  const pestanaElegida = {};

  function textoValor(valor) {
    return Array.isArray(valor) ? valor.join(", ") : String(valor);
  }

  function coeficienteDe(id) {
    return propietarios[id] ? propietarios[id].coeficiente : 0;
  }

  function nombreDe(id) {
    return propietarios[id] ? propietarios[id].nombre : id;
  }

  /* ----- Pestaña 1: quórum del punto ----- */

  function panelQuorum(dieron, ids, coeficienteVotado) {
    const panel = document.createElement("div");
    panel.className = "grafica";

    const ausente = Math.max(0, coeficienteEdificio - coeficienteVotado);
    const fraccion =
      coeficienteEdificio > 0 ? coeficienteVotado / coeficienteEdificio : 0;

    panel.append(
      anilloCon(
        [
          { fraccion: fraccion, color: "#0b6e5f" },
          { fraccion: 1 - fraccion, color: GRIS },
        ],
        porcentaje(coeficienteVotado) + "%",
        "del edificio",
      ),
    );

    panel.append(
      tabla(
        [
          { texto: "Participación" },
          { texto: "Propietarios", num: true },
          { texto: "Coeficiente", num: true },
        ],
        [
          {
            destacada: true,
            celdas: [
              { texto: "Votaron", color: "#0b6e5f" },
              { texto: String(ids.length), num: true },
              { texto: porcentaje(coeficienteVotado) + "%", num: true },
            ],
          },
          {
            celdas: [
              { texto: "No votaron", color: GRIS },
              { texto: String(totalPropietarios - ids.length), num: true },
              { texto: porcentaje(ausente) + "%", num: true },
            ],
          },
        ],
      ),
    );

    return panel;
  }

  /* ----- Pestaña 2: calificación del punto ----- */

  function panelCalificacion(pregunta, dieron, ids, coeficienteVotado) {
    const panel = document.createElement("div");

    if (pregunta.tipo !== "cerrada") {
      panel.className = "abiertas";

      if (!ids.length) {
        const vacio = document.createElement("p");
        vacio.className = "detalle-linea apagado";
        vacio.textContent = "Nadie ha respondido todavía.";
        panel.append(vacio);
        return panel;
      }

      ids.forEach((id) => {
        const bloque = document.createElement("blockquote");
        bloque.className = "respuesta-abierta";

        const texto = document.createElement("p");
        texto.textContent = textoValor(dieron[id].valor);

        const autor = document.createElement("p");
        autor.className = "detalle-linea apagado";
        autor.textContent =
          nombreDe(id) + "  ·  " + porcentaje(coeficienteDe(id)) + "%";

        bloque.append(texto, autor);
        panel.append(bloque);
      });

      return panel;
    }

    panel.className = "grafica";

    const filas = pregunta.opciones.map((opcion, i) => {
      const quienes = ids.filter((id) => {
        const valor = dieron[id].valor;
        return Array.isArray(valor) ? valor.includes(opcion) : valor === opcion;
      });

      const coeficiente = quienes.reduce((s, id) => s + coeficienteDe(id), 0);

      return {
        opcion: opcion,
        color: COLORES[i % COLORES.length],
        votos: quienes.length,
        coeficiente: coeficiente,
        fraccion: coeficienteVotado > 0 ? coeficiente / coeficienteVotado : 0,
      };
    });

    const mayor = filas.reduce((m, f) => Math.max(m, f.coeficiente), 0);

    // En las de varias respuestas los tramos suman más de 100%, así que
    // la dona mentiría y se muestra solo el cuadro.
    if (!pregunta.multiple) {
      const lider = filas.reduce(
        (m, f) => (f.coeficiente > m.coeficiente ? f : m),
        filas[0] || { fraccion: 0, opcion: "—" },
      );

      panel.append(
        anilloCon(
          filas,
          coeficienteVotado > 0 ? porcentaje(lider.fraccion) + "%" : "—",
          coeficienteVotado > 0 ? lider.opcion : "sin votos",
        ),
      );
    }

    panel.append(
      tabla(
        [
          { texto: "Opción" },
          { texto: "Votos", num: true },
          { texto: "Del total", num: true },
          { texto: "De lo votado", num: true },
        ],
        filas.map((f) => ({
          destacada: mayor > 0 && f.coeficiente === mayor,
          celdas: [
            { texto: f.opcion, color: f.color },
            { texto: String(f.votos), num: true },
            { texto: porcentaje(f.coeficiente) + "%", num: true },
            { texto: porcentaje(f.fraccion) + "%", num: true },
          ],
        })),
      ),
    );

    return panel;
  }

  /* ----- Detalle nominal ----- */

  function bloqueDetalle(dieron, ids) {
    const detalle = document.createElement("div");
    detalle.className = "detalle";
    detalle.hidden = true;

    if (ids.length) {
      detalle.append(
        tabla(
          [
            { texto: "Propietario" },
            { texto: "Coef.", num: true },
            { texto: "Respuesta" },
          ],
          ids.map((id) => ({
            celdas: [
              { texto: nombreDe(id) },
              { texto: porcentaje(coeficienteDe(id)) + "%", num: true },
              {
                texto: textoValor(dieron[id].valor),
                nota:
                  dieron[id].votadaPor && dieron[id].votadaPor !== id
                    ? "por apoderado " + dieron[id].votadaPor
                    : null,
              },
            ],
          })),
        ),
      );
    }

    const faltantes = Object.keys(propietarios).filter((id) => !dieron[id]);

    if (faltantes.length) {
      const titulo = document.createElement("p");
      titulo.className = "detalle-titulo";
      titulo.textContent = "Sin responder (" + faltantes.length + ")";

      const linea = document.createElement("p");
      linea.className = "detalle-linea apagado";
      linea.textContent = faltantes.map(nombreDe).join("  ·  ");

      detalle.append(titulo, linea);
    }

    return detalle;
  }

  /* ----- Tarjeta de un punto ----- */

  function tarjeta(pregunta, indice) {
    const dieron = respuestas[pregunta.id] || {};
    const ids = Object.keys(dieron);
    const coeficienteVotado = ids.reduce((s, id) => s + coeficienteDe(id), 0);

    const seccion = document.createElement("section");
    seccion.className =
      "resultado" + (pregunta.tipo === "abierta" ? " ancho" : "");

    const cabecera = document.createElement("div");
    cabecera.className = "resultado-cabecera";

    const numero = document.createElement("p");
    numero.className = "eyebrow";
    numero.textContent = "Punto " + (indice + 1);

    const participacion = document.createElement("span");
    participacion.className = "sello";
    participacion.textContent = ids.length + " / " + totalPropietarios;

    cabecera.append(numero, participacion);

    const titulo = document.createElement("h2");
    titulo.className = "pregunta-titulo";
    titulo.textContent = pregunta.titulo;

    seccion.append(cabecera, titulo);

    /* Pestañas */

    const paneles = [
      { clave: "quorum", nombre: "Quórum", contenido: panelQuorum(dieron, ids, coeficienteVotado) },
      {
        clave: "calificacion",
        nombre: "Calificación",
        contenido: panelCalificacion(pregunta, dieron, ids, coeficienteVotado),
      },
    ];

    const activa = pestanaElegida[pregunta.id] || "quorum";

    const barra = document.createElement("div");
    barra.className = "pestanas";
    barra.setAttribute("role", "tablist");

    paneles.forEach((panel) => {
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "pestana";
      boton.textContent = panel.nombre;
      boton.setAttribute("role", "tab");
      boton.setAttribute("aria-selected", String(panel.clave === activa));

      panel.contenido.classList.add("panel-pestana");
      panel.contenido.hidden = panel.clave !== activa;

      boton.addEventListener("click", () => {
        pestanaElegida[pregunta.id] = panel.clave;

        paneles.forEach((otro) => {
          otro.contenido.hidden = otro.clave !== panel.clave;
        });

        Array.from(barra.children).forEach((otroBoton, i) => {
          otroBoton.setAttribute(
            "aria-selected",
            String(paneles[i].clave === panel.clave),
          );
        });
      });

      barra.append(boton);
    });

    seccion.append(barra);
    paneles.forEach((panel) => seccion.append(panel.contenido));

    /* Detalle */

    const detalle = bloqueDetalle(dieron, ids);

    const verDetalle = document.createElement("button");
    verDetalle.type = "button";
    verDetalle.className = "btn-mini";
    verDetalle.textContent = "Ver detalle";
    verDetalle.addEventListener("click", () => {
      detalle.hidden = !detalle.hidden;
      verDetalle.textContent = detalle.hidden ? "Ver detalle" : "Ocultar detalle";
    });

    const acciones = document.createElement("div");
    acciones.className = "acciones";
    acciones.append(verDetalle);

    seccion.append(acciones, detalle);
    return seccion;
  }

  function pintarResumen() {
    const conRespuesta = preguntas.filter(
      (p) => Object.keys(respuestas[p.id] || {}).length,
    ).length;

    const votantes = Object.keys(propietarios).filter((id) =>
      preguntas.some((p) => (respuestas[p.id] || {})[id]),
    );

    const coeficienteVotante = votantes.reduce(
      (suma, id) => suma + coeficienteDe(id),
      0,
    );

    resumen.innerHTML = "";

    [
      [preguntas.length, "Puntos del orden del día"],
      [conRespuesta + " / " + preguntas.length, "Con votos registrados"],
      [votantes.length + " / " + totalPropietarios, "Propietarios que votaron"],
      [porcentaje(coeficienteVotante) + "%", "Coeficiente que votó"],
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
      resumen.append(metrica);
    });
  }

  function pintar() {
    pintarResumen();
    contenedor.innerHTML = "";

    if (!preguntas.length) {
      contenedor.innerHTML =
        '<p class="vacio">No hay preguntas configuradas todavía.</p>';
      return;
    }

    preguntas.forEach((pregunta, indice) => {
      contenedor.append(tarjeta(pregunta, indice));
    });
  }

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
          orden: Number(datos.orden) || 0,
        });
      });

      preguntas.sort((a, b) => a.orden - b.orden);
      pintar();
    },
    (e) => {
      console.error(e);
      contenedor.innerHTML =
        '<p class="vacio">No se pudieron cargar las preguntas.</p>';
    },
  );

  onValue(ref(db, "respuestas"), (snapshot) => {
    respuestas = snapshot.val() || {};
    pintar();
  });
}

const sesion = leerSesion();
if (sesion && sesion.type === "0") {
  iniciarReporte();
}