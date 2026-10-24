// Tab Rak: simpan file sementara lewat drag & drop, lalu seret keluar lagi.
(() => {
  const { $, api } = C;
  const notch = $('notch');
  let items = [];
  let dragDepth = 0;

  function render() {
    $('shelfEmpty').style.display = items.length ? 'none' : 'flex';
    $('shelfGrid').style.display = items.length ? 'grid' : 'none';
    $('shelfCount').textContent = items.length ? `${items.length} file` : '';
    $('shelfClear').style.visibility = items.length ? 'visible' : 'hidden';
    $('shelfGrid').innerHTML = items
      .map(
        (f, i) => `
        <div class="file${f.exists ? '' : ' missing'}" draggable="true" data-i="${i}" title="${C.escape(f.path)}${f.exists ? '' : ' (tidak ditemukan)'}">
          <img src="${f.icon || ''}" alt="" ${f.icon ? '' : 'hidden'} />
          <span class="fname">${C.escape(f.name)}</span>
          <button class="remove" data-remove="${i}" title="Hapus dari rak">×</button>
        </div>`
      )
      .join('');
  }

  async function refresh() {
    items = await api.shelf.list();
    render();
  }

  const isFileDrag = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');

  document.addEventListener('dragenter', (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth++;
    notch.classList.add('dragging');
    C.app.expand('shelf');
  });
  document.addEventListener('dragover', (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('dragleave', (e) => {
    if (!isFileDrag(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) notch.classList.remove('dragging');
  });
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0;
    notch.classList.remove('dragging');
    if (!e.dataTransfer) return;
    const paths = [...e.dataTransfer.files].map((f) => api.shelf.pathForFile(f)).filter(Boolean);
    if (!paths.length) return;
    items = await api.shelf.add(paths);
    render();
    C.app.expand('shelf');
  });

  $('shelfGrid').addEventListener('dragstart', (e) => {
    const el = e.target.closest('.file');
    if (!el) return;
    e.preventDefault();
    const f = items[Number(el.dataset.i)];
    if (f && f.exists) api.shelf.drag(f.path);
  });

  $('shelfGrid').addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      e.stopPropagation();
      items = await api.shelf.remove(items[Number(rm.dataset.remove)].path);
      render();
    }
  });

  $('shelfGrid').addEventListener('dblclick', (e) => {
    const el = e.target.closest('.file');
    if (el) api.shelf.open(items[Number(el.dataset.i)].path);
  });

  $('shelfGrid').addEventListener('contextmenu', (e) => {
    const el = e.target.closest('.file');
    if (el) api.shelf.reveal(items[Number(el.dataset.i)].path);
  });

  $('shelfClear').addEventListener('click', async () => {
    items = await api.shelf.clear();
    render();
  });

  document.addEventListener('tab-change', (e) => {
    if (e.detail === 'shelf') refresh();
  });
  refresh();
})();
