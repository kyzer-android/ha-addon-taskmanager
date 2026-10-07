// Petit utilitaire de création d'éléments (sans innerHTML, donc sans injection).
export const h = (tag, attrs = {}, ...children) => {
  const element = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value === false || value === null || value === undefined) return;
    if (key === 'class') element.className = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'value') element.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'draggable') {
      element[key] = Boolean(value);
    } else element.setAttribute(key, value === true ? '' : value);
  });
  children.flat(Infinity).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return element;
};

export const clear = (element) => {
  element.replaceChildren();
  return element;
};

export const toast = (message) => {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.classList.add('is-visible');
  setTimeout(() => element.classList.remove('is-visible'), 2500);
};

export const field = (label, control) =>
  h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control);

export const todayIso = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};
