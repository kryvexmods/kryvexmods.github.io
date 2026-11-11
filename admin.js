import { getSupabase, isSupabaseConfigured } from "./supabase-client.js";

const bucketName = "site-media";
const maximumImageSize = 10 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const setupMessage = document.querySelector("#setup-message");
const authMessage = document.querySelector("#auth-message");
const publishMessage = document.querySelector("#publish-message");
const loginForm = document.querySelector("#login-form");
const passwordForm = document.querySelector("#password-form");
const dashboard = document.querySelector("#dashboard");
const authFlowType = new URLSearchParams(window.location.hash.slice(1)).get("type");
let isPasswordSetupFlow = ["invite", "recovery"].includes(authFlowType);
let supabase;

function displayMessage(target, text, isError = false) {
  target.textContent = text;
  target.classList.toggle("error", isError);
  target.hidden = !text;
}

function slugifyFilename(name) {
  const extension = name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const stem = name.slice(0, -(name.length ? name.split(".").pop().length + 1 : 0))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "imagen";
  return `${stem}.${extension}`;
}

function getImageFile(form, required) {
  const file = form.elements.image.files[0];
  if (!file && required) throw new Error("Selecciona una imagen.");
  if (!file) return null;
  if (!allowedImageTypes.has(file.type)) throw new Error("La imagen debe ser JPG, PNG o WebP.");
  if (file.size > maximumImageSize) throw new Error("La imagen supera el límite de 10 MB.");
  return file;
}

function validateMegaUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Introduce un enlace de MEGA válido.");
  }
  if (url.protocol !== "https:" || !["mega.nz", "www.mega.nz", "mega.co.nz", "www.mega.co.nz"].includes(url.hostname)) {
    throw new Error("El enlace de descarga debe ser de mega.nz o mega.co.nz y usar HTTPS.");
  }
  return url.href;
}

async function uploadImage(file, folder) {
  if (!file) return null;
  const path = `${folder}/${crypto.randomUUID()}-${slugifyFilename(file.name)}`;
  const { error } = await supabase.storage.from(bucketName).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false
  });
  if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`);
  return path;
}

async function removeOrphanedImage(path) {
  if (!path) return "";
  const { error } = await supabase.storage.from(bucketName).remove([path]);
  return error ? ` No se pudo limpiar la imagen subida (${error.message}).` : "";
}

async function insertPublication(form, table, folder, requiredImage, getValues) {
  displayMessage(publishMessage, "");
  let imagePath = null;
  try {
    const values = getValues(form);
    const image = getImageFile(form, requiredImage);
    imagePath = await uploadImage(image, folder);
    const { error } = await supabase.from(table).insert({ ...values, image_path: imagePath });
    if (error) {
      const cleanupError = await removeOrphanedImage(imagePath);
      imagePath = null;
      throw new Error(`No se pudo guardar la publicación: ${error.message}.${cleanupError}`);
    }
    form.reset();
    displayMessage(publishMessage, "Publicación añadida correctamente.");
    await loadDashboard();
  } catch (error) {
    if (imagePath) {
      const cleanupError = await removeOrphanedImage(imagePath);
      if (cleanupError) error.message += cleanupError;
    }
    displayMessage(publishMessage, error.message || "No se pudo completar la publicación.", true);
  }
}

function makeAdminRow(title, description, id, onDelete) {
  const row = document.createElement("div");
  row.className = "admin-row";
  const details = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const text = document.createElement("span");
  text.textContent = description;
  details.append(heading, text);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "admin-button danger";
  button.textContent = "Eliminar";
  button.addEventListener("click", () => onDelete(id));
  row.append(details, button);
  return row;
}

async function loadDashboard() {
  const [modsResult, photosResult] = await Promise.all([
    supabase.from("mods").select("id,title,mega_url").order("created_at", { ascending: false }),
    supabase.from("work_photos").select("id,title,description").order("created_at", { ascending: false })
  ]);
  if (modsResult.error || photosResult.error) {
    const error = modsResult.error || photosResult.error;
    displayMessage(publishMessage, `No se pudieron cargar tus publicaciones: ${error.message}`, true);
    return;
  }

  document.querySelector("#admin-mods").replaceChildren(...modsResult.data.map((mod) =>
    makeAdminRow(mod.title, mod.mega_url, mod.id, (id) => deletePublication("mods", id))
  ));
  document.querySelector("#admin-photos").replaceChildren(...photosResult.data.map((photo) =>
    makeAdminRow(photo.title, photo.description, photo.id, (id) => deletePublication("work_photos", id))
  ));
}

async function deletePublication(table, id) {
  if (!confirm("¿Quieres eliminar esta publicación?")) return;
  displayMessage(publishMessage, "");
  const { data, error } = await supabase.from(table).delete().eq("id", id).select("image_path");
  if (error) {
    displayMessage(publishMessage, `No se pudo eliminar: ${error.message}`, true);
    return;
  }

  const imagePath = data[0]?.image_path;
  if (imagePath) {
    const { error: storageError } = await supabase.storage.from(bucketName).remove([imagePath]);
    if (storageError) {
      displayMessage(publishMessage, `La publicación se eliminó, pero no se pudo borrar su imagen: ${storageError.message}`, true);
    }
  }
  await loadDashboard();
}

async function showSession(session) {
  const user = session?.user;
  const isAdmin = user?.app_metadata?.role === "admin";
  if (isPasswordSetupFlow && user) {
    dashboard.hidden = true;
    loginForm.hidden = true;
    passwordForm.hidden = false;
    displayMessage(authMessage, "Crea una contraseña para acceder al panel.");
    return;
  }

  passwordForm.hidden = true;
  if (!isAdmin) {
    dashboard.hidden = true;
    loginForm.hidden = false;
    if (user) {
      await supabase.auth.signOut();
      displayMessage(authMessage, "Esta cuenta no tiene permisos de administración.", true);
    }
    return;
  }

  loginForm.hidden = true;
  dashboard.hidden = false;
  displayMessage(authMessage, "");
  document.querySelector("#signed-in-user").textContent = user.email;
  await loadDashboard();
}

async function initialize() {
  if (!isSupabaseConfigured) {
    setupMessage.innerHTML = 'Configura <code>supabase-config.js</code> y ejecuta <code>supabase-setup.sql</code> en el SQL Editor de tu proyecto. Revisa la guía de configuración incluida en ese archivo.';
    setupMessage.hidden = false;
    return;
  }

  try {
    supabase = await getSupabase();
    loginForm.hidden = false;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    await showSession(data.session);
    supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => showSession(session), 0);
    });
  } catch (error) {
    displayMessage(authMessage, `No se pudo inicializar el panel: ${error.message}`, true);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  displayMessage(authMessage, "");
  const formData = new FormData(loginForm);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: formData.get("email"),
    password: formData.get("password")
  });
  if (error) {
    displayMessage(authMessage, `No se pudo iniciar sesión: ${error.message}`, true);
    return;
  }
  await showSession(data.session);
});

document.querySelector("#sign-out").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) displayMessage(publishMessage, `No se pudo cerrar sesión: ${error.message}`, true);
  else {
    dashboard.hidden = true;
    loginForm.hidden = false;
  }
});

document.querySelector("#request-password-reset").addEventListener("click", async () => {
  displayMessage(authMessage, "");
  const email = loginForm.elements.email.value.trim();
  if (!email) {
    displayMessage(authMessage, "Escribe tu email y vuelve a pulsar el botón.", true);
    loginForm.elements.email.focus();
    return;
  }
  if (!["http:", "https:"].includes(window.location.protocol)) {
    displayMessage(authMessage, "Abre el panel desde http://localhost:8000 para solicitar el enlace.", true);
    return;
  }

  try {
    const redirectTo = new URL("admin.html", window.location.href).href;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    displayMessage(authMessage, "Si el usuario existe, recibirás un enlace para crear o restablecer la contraseña.");
  } catch (error) {
    displayMessage(authMessage, `No se pudo enviar el enlace: ${error.message}`, true);
  }
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  displayMessage(authMessage, "");
  const password = passwordForm.elements.password.value;
  if (password !== passwordForm.elements.passwordConfirmation.value) {
    displayMessage(authMessage, "Las contraseñas no coinciden.", true);
    return;
  }

  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    isPasswordSetupFlow = false;
    passwordForm.reset();
    window.history.replaceState(null, "", window.location.pathname);
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    await showSession(data.session);
    displayMessage(authMessage, "Contraseña guardada. Ya puedes administrar tus publicaciones.");
  } catch (error) {
    displayMessage(authMessage, `No se pudo guardar la contraseña: ${error.message}`, true);
  }
});

document.querySelector("#mod-form").addEventListener("submit", (event) => {
  event.preventDefault();
  insertPublication(event.currentTarget, "mods", "mods", false, (form) => ({
    title: form.elements.title.value.trim(),
    description: form.elements.description.value.trim(),
    mega_url: validateMegaUrl(form.elements.megaUrl.value.trim())
  }));
});

document.querySelector("#photo-form").addEventListener("submit", (event) => {
  event.preventDefault();
  insertPublication(event.currentTarget, "work_photos", "work-photos", true, (form) => ({
    title: form.elements.title.value.trim(),
    description: form.elements.description.value.trim()
  }));
});

initialize();
