import { getSupabase, isSupabaseConfigured } from "./supabase-client.js";

const bucket = "site-media";
const placeholderMessage = "Configura Supabase para ver las publicaciones y subir tus fotos desde el panel creador.";

function showMessage(container, text, isError = false) {
  const message = document.createElement("p");
  message.className = isError ? "content-message error" : "content-message";
  message.textContent = text;
  container.replaceChildren(message);
}

function publicImage(client, path) {
  return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

function makeModCard(client, mod) {
  const card = document.createElement("article");
  card.className = "published-card";
  if (mod.image_path) {
    const image = document.createElement("img");
    image.src = publicImage(client, mod.image_path);
    image.alt = `Portada de ${mod.title}`;
    image.loading = "lazy";
    card.append(image);
  }
  const body = document.createElement("div");
  body.className = "published-card-body";
  const title = document.createElement("h3");
  title.textContent = mod.title;
  const description = document.createElement("p");
  description.textContent = mod.description || "Mod gratuito para GTA V.";
  const link = document.createElement("a");
  link.className = "download-link";
  link.href = mod.mega_url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Descargar gratis en MEGA ↗";
  body.append(title, description, link);
  card.append(body);
  return card;
}

function makePhotoCard(client, photo) {
  const card = document.createElement("article");
  card.className = "published-photo";
  const image = document.createElement("img");
  image.src = publicImage(client, photo.image_path);
  image.alt = photo.title;
  image.loading = "lazy";
  const caption = document.createElement("div");
  caption.className = "published-photo-caption";
  const title = document.createElement("h2");
  title.textContent = photo.title;
  const description = document.createElement("p");
  description.textContent = photo.description || "";
  const date = document.createElement("time");
  date.dateTime = photo.created_at;
  date.textContent = new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(photo.created_at));
  caption.append(title, description, date);
  card.append(image, caption);
  return card;
}

async function loadCollection(client, selector, query, makeCard, emptyText) {
  const container = document.querySelector(selector);
  if (!container) return;

  const { data, error } = await query;
  if (error) {
    showMessage(container, "No se pudieron cargar las publicaciones. Inténtalo más tarde.", true);
    console.error(`KryvexMods: error loading ${selector}`, error);
    return;
  }
  if (!data.length) {
    showMessage(container, emptyText);
    return;
  }
  container.replaceChildren(...data.map((item) => makeCard(client, item)));
}

async function initializePublicContent() {
  const containers = [
    ["[data-free-mods]", "mods"],
    ["[data-latest-photos]", "photos"]
  ].map(([selector]) => document.querySelector(selector)).filter(Boolean);
  if (!containers.length) return;

  if (!isSupabaseConfigured) {
    containers.forEach((container) => showMessage(container, placeholderMessage));
    return;
  }

  try {
    const client = await getSupabase();
    const tasks = [];
    if (document.querySelector("[data-free-mods]")) {
      tasks.push(loadCollection(
        client,
        "[data-free-mods]",
        client.from("mods").select("id,title,description,mega_url,image_path,created_at").order("created_at", { ascending: false }),
        (mod) => makeModCard(client, mod),
        "Todavía no hay mods gratuitos publicados."
      ));
    }
    if (document.querySelector("[data-latest-photos]")) {
      tasks.push(loadCollection(
        client,
        "[data-latest-photos]",
        client.from("work_photos").select("id,title,description,image_path,created_at").order("created_at", { ascending: false }),
        (photo) => makePhotoCard(client, photo),
        "Todavía no hay fotos nuevas publicadas."
      ));
    }
    await Promise.all(tasks);
  } catch (error) {
    containers.forEach((container) => showMessage(container, "No se pudieron conectar las publicaciones. Revisa la configuración de Supabase.", true));
    console.error("KryvexMods: Supabase public content failed to initialize", error);
  }
}

initializePublicContent();
