import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import toast, { Toaster } from 'react-hot-toast'

const CATEGORIES = ['Mainan', 'Peralatan Sekolah', 'Tas', 'Buket', 'Hijab', 'Frozenan', 'Lainnya']
const CATEGORY_ICONS = {
  'Mainan': '🧸', 'Peralatan Sekolah': '📚', 'Tas': '👜',
  'Buket': '💐', 'Hijab': '🧕', 'Frozenan': '🧊', 'Lainnya': '📦',
}

function formatRupiah(n) {
  return 'Rp ' + Number(n).toLocaleString('id-ID')
}

export default function Stok() {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('Semua')
  const [showModal, setShowModal] = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const fileInputRef = useRef(null)

  const [form, setForm] = useState({
    name: '', category: 'Mainan', price: '', stock: '', barcode: '', photo_url: '',
  })

  useEffect(() => { loadProducts() }, [])

  async function loadProducts() {
    setLoading(true)
    const { data, error } = await supabase
      .from('products').select('*').order('category').order('name')
    if (!error) setProducts(data || [])
    setLoading(false)
  }

  const filtered = products.filter(p => {
    const matchSearch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.barcode && p.barcode.includes(searchQuery))
    const matchCat = filterCategory === 'Semua' || p.category === filterCategory
    return matchSearch && matchCat
  })

  function openAdd() {
    setEditProduct(null)
    setForm({ name: '', category: 'Mainan', price: '', stock: '', barcode: '', photo_url: '' })
    setShowModal(true)
  }

  function openEdit(product) {
    setEditProduct(product)
    setForm({
      name: product.name,
      category: product.category,
      price: product.price,
      stock: product.stock,
      barcode: product.barcode || '',
      photo_url: product.photo_url || '',
    })
    setShowModal(true)
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Ukuran foto maksimal 2MB')
      return
    }
    setUploadingPhoto(true)
    const ext = file.name.split('.').pop()
    const fileName = `${Date.now()}.${ext}`
    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(fileName, file)
    if (error) {
      toast.error('Gagal upload foto')
    } else {
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName)
      setForm(f => ({ ...f, photo_url: urlData.publicUrl }))
      toast.success('Foto berhasil diupload')
    }
    setUploadingPhoto(false)
  }

  async function handleRemovePhoto() {
    setForm(f => ({ ...f, photo_url: '' }))
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Nama barang wajib diisi'); return }
    if (!form.price || isNaN(form.price)) { toast.error('Harga wajib diisi'); return }
    if (!form.stock || isNaN(form.stock)) { toast.error('Stok wajib diisi'); return }

    const payload = {
      name: form.name.trim(),
      category: form.category,
      price: parseInt(form.price),
      stock: parseInt(form.stock),
      barcode: form.barcode.trim() || null,
      photo_url: form.photo_url || null,
    }

    if (editProduct) {
      const { error } = await supabase.from('products').update(payload).eq('id', editProduct.id)
      if (error) { toast.error('Gagal menyimpan perubahan'); return }
      toast.success('Barang berhasil diperbarui')
    } else {
      const { error } = await supabase.from('products').insert(payload)
      if (error) { toast.error('Gagal menambah barang'); return }
      toast.success('Barang berhasil ditambahkan')
    }
    setShowModal(false)
    loadProducts()
  }

  async function handleDelete(product) {
    const { error } = await supabase.from('products').update({ is_active: false }).eq('id', product.id)
    if (error) { toast.error('Gagal menghapus barang'); return }
    toast.success('Barang dihapus')
    setDeleteConfirm(null)
    loadProducts()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  const stockStats = {
    total: products.length,
    habis: products.filter(p => p.stock === 0).length,
    menipis: products.filter(p => p.stock > 0 && p.stock <= 5).length,
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <Toaster position="top-center" toastOptions={{ duration: 2000 }} />

      {/* NAV */}
      <nav className="bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-neutral-900 rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
            </svg>
          </div>
          <span className="font-semibold text-neutral-900 text-sm">Sistem Kasir</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => navigate('/kasir')} className="px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors">Kasir</button>
          <button onClick={() => navigate('/laporan')} className="px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors">Laporan</button>
          <button onClick={handleLogout} className="px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100 rounded-lg transition-colors">Keluar</button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900">Manajemen Stok</h1>
            <p className="text-xs text-neutral-500 mt-0.5">{products.length} produk terdaftar</p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-xl hover:bg-neutral-700 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Tambah Barang
          </button>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <div className="text-xs text-neutral-500 mb-1">Total Produk</div>
            <div className="text-2xl font-semibold text-neutral-900">{stockStats.total}</div>
          </div>
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <div className="text-xs text-neutral-500 mb-1">Stok Menipis</div>
            <div className="text-2xl font-semibold text-orange-500">{stockStats.menipis}</div>
          </div>
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <div className="text-xs text-neutral-500 mb-1">Stok Habis</div>
            <div className="text-2xl font-semibold text-red-500">{stockStats.habis}</div>
          </div>
        </div>

        {/* FILTER & SEARCH */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cari nama, kategori, atau barcode..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:border-neutral-400 transition-colors"
            />
          </div>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:border-neutral-400 transition-colors"
          >
            <option value="Semua">Semua Kategori</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* TABLE */}
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-neutral-400 text-sm">Memuat data...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-400 gap-2">
              <span className="text-3xl">📦</span>
              <span className="text-sm">Tidak ada produk ditemukan</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-100">
                    <th className="text-left text-xs font-medium text-neutral-500 px-4 py-3">Produk</th>
                    <th className="text-left text-xs font-medium text-neutral-500 px-4 py-3">Kategori</th>
                    <th className="text-right text-xs font-medium text-neutral-500 px-4 py-3">Harga</th>
                    <th className="text-center text-xs font-medium text-neutral-500 px-4 py-3">Stok</th>
                    <th className="text-left text-xs font-medium text-neutral-500 px-4 py-3">Barcode</th>
                    <th className="text-center text-xs font-medium text-neutral-500 px-4 py-3">Status</th>
                    <th className="text-right text-xs font-medium text-neutral-500 px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {filtered.map(product => (
                    <tr key={product.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center text-lg flex-shrink-0 overflow-hidden">
                            {product.photo_url
                              ? <img src={product.photo_url} alt={product.name} className="w-full h-full object-cover" />
                              : CATEGORY_ICONS[product.category] || '📦'
                            }
                          </div>
                          <span className="text-sm font-medium text-neutral-800">{product.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-500">{product.category}</td>
                      <td className="px-4 py-3 text-sm font-medium text-neutral-800 text-right">{formatRupiah(product.price)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm font-semibold ${product.stock === 0 ? 'text-red-500' : product.stock <= 5 ? 'text-orange-500' : 'text-neutral-800'}`}>
                          {product.stock}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-400 font-mono">{product.barcode || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {product.stock === 0 ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">Habis</span>
                        ) : product.stock <= 5 ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-600">Menipis</span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-600">Tersedia</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(product)}
                            className="text-xs text-neutral-600 hover:text-neutral-900 px-2 py-1 rounded-lg hover:bg-neutral-100 transition-colors"
                          >Edit</button>
                          <button
                            onClick={() => setDeleteConfirm(product)}
                            className="text-xs text-neutral-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                          >Hapus</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* MODAL TAMBAH/EDIT */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-neutral-900">
                {editProduct ? 'Edit Barang' : 'Tambah Barang Baru'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-neutral-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">

              {/* FOTO */}
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-2">Foto Produk (opsional, maks. 2MB)</label>
                {form.photo_url ? (
                  <div className="relative w-24 h-24">
                    <img src={form.photo_url} alt="preview" className="w-24 h-24 object-cover rounded-xl border border-neutral-200" />
                    <button
                      onClick={handleRemovePhoto}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                    >×</button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="w-24 h-24 border-2 border-dashed border-neutral-200 rounded-xl flex flex-col items-center justify-center text-neutral-400 hover:border-neutral-400 hover:text-neutral-600 transition-colors"
                  >
                    {uploadingPhoto ? (
                      <span className="text-xs">Upload...</span>
                    ) : (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <span className="text-xs mt-1">Upload</span>
                      </>
                    )}
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </div>

              {/* NAMA */}
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Nama Barang *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="misal: Mainan Mobil Remote"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-neutral-400 bg-neutral-50 focus:bg-white transition-colors"
                />
              </div>

              {/* KATEGORI */}
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Kategori *</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-neutral-400 bg-neutral-50 focus:bg-white transition-colors"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
                </select>
              </div>

              {/* HARGA & STOK */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1.5">Harga Jual (Rp) *</label>
                  <input
                    type="number"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-neutral-400 bg-neutral-50 focus:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1.5">Stok *</label>
                  <input
                    type="number"
                    value={form.stock}
                    onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-neutral-400 bg-neutral-50 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              {/* BARCODE */}
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Barcode (opsional)</label>
                <input
                  type="text"
                  value={form.barcode}
                  onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                  placeholder="Scan atau ketik barcode bawaan produk"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-neutral-400 bg-neutral-50 focus:bg-white transition-colors font-mono"
                />
                <p className="text-xs text-neutral-400 mt-1">Untuk barang tanpa barcode, kosongkan saja</p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-neutral-100 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 border border-neutral-200 text-sm text-neutral-600 rounded-xl hover:bg-neutral-50 transition-colors"
              >Batal</button>
              <button
                onClick={handleSave}
                className="flex-1 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-xl hover:bg-neutral-700 transition-colors"
              >Simpan</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h2 className="text-base font-semibold text-neutral-900 mb-2">Hapus Barang?</h2>
            <p className="text-sm text-neutral-500 mb-6">
              <span className="font-medium text-neutral-800">"{deleteConfirm.name}"</span> akan dihapus dari daftar produk. Data transaksi lama tetap tersimpan.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 border border-neutral-200 text-sm text-neutral-600 rounded-xl hover:bg-neutral-50 transition-colors"
              >Batal</button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2.5 bg-red-500 text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors"
              >Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}