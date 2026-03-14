import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import toast, { Toaster } from 'react-hot-toast'
import BarcodeScanner from '../components/BarcodeScanner'

const CATEGORY_ICONS = {
  'Mainan': '🧸', 'Peralatan Sekolah': '📚', 'Tas': '👜',
  'Buket': '💐', 'Hijab': '🧕', 'Frozenan': '🧊', 'Lainnya': '📦',
}
const CATEGORIES = ['Semua', 'Mainan', 'Peralatan Sekolah', 'Tas', 'Buket', 'Hijab', 'Frozenan', 'Lainnya']

function formatRupiah(n) {
  return 'Rp ' + Number(n).toLocaleString('id-ID')
}

export default function Kasir() {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState([])
  const [activeCategory, setActiveCategory] = useState('Semua')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(true)
  const [payModal, setPayModal] = useState(false)
  const [cashInput, setCashInput] = useState('')
  const [payLoading, setPayLoading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [showCartSheet, setShowCartSheet] = useState(false)
  const [barcodeBuffer, setBarcodeBuffer] = useState('')
  const searchRef = useRef(null)
  const barcodeTimer = useRef(null)

  useEffect(() => { loadProducts() }, [])

  async function loadProducts() {
    setLoading(true)
    const { data, error } = await supabase.from('products').select('*').eq('is_active', true).order('name')
    if (!error) setProducts(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setShowDropdown(false); return }
    const q = searchQuery.toLowerCase()
    const results = products.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)).slice(0, 8)
    setSearchResults(results)
    setShowDropdown(results.length > 0)
  }, [searchQuery, products])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'F1') { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === 'Escape') { setShowDropdown(false); setSearchQuery(''); searchRef.current?.blur() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    function handleBarcode(e) {
      if (document.activeElement === searchRef.current) return
      if (showScanner) return
      if (e.key === 'Enter') {
        if (barcodeBuffer.length >= 4) handleBarcodeInput(barcodeBuffer)
        setBarcodeBuffer('')
        clearTimeout(barcodeTimer.current)
        return
      }
      if (e.key.length === 1) {
        setBarcodeBuffer(prev => prev + e.key)
        clearTimeout(barcodeTimer.current)
        barcodeTimer.current = setTimeout(() => setBarcodeBuffer(''), 100)
      }
    }
    window.addEventListener('keydown', handleBarcode)
    return () => window.removeEventListener('keydown', handleBarcode)
  }, [barcodeBuffer, products, showScanner])

  function handleBarcodeInput(code) {
    const product = products.find(p => p.barcode === code)
    if (product) { addToCart(product); toast.success(`${product.name} ditambahkan`) }
    else toast.error(`Barcode tidak ditemukan: ${code}`)
  }

  function handleCameraScan(code) {
    setShowScanner(false)
    handleBarcodeInput(code)
  }

  function addToCart(product) {
    if (product.stock <= 0) { toast.error('Stok habis!'); return }
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) {
        if (existing.qty >= product.stock) { toast.error('Melebihi stok tersedia'); return prev }
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, { ...product, qty: 1 }]
    })
  }

  function removeFromCart(id) {
    setCart(prev => {
      const existing = prev.find(i => i.id === id)
      if (existing.qty > 1) return prev.map(i => i.id === id ? { ...i, qty: i.qty - 1 } : i)
      return prev.filter(i => i.id !== id)
    })
  }

  function deleteFromCart(id) { setCart(prev => prev.filter(i => i.id !== id)) }
  function clearCart() { setCart([]) }

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const cartCount = cart.reduce((s, i) => s + i.qty, 0)
  const cashGiven = parseInt(cashInput) || 0
  const change = cashGiven - cartTotal

  const filteredProducts = products.filter(p =>
    activeCategory === 'Semua' || p.category === activeCategory
  )

  async function handlePayment() {
    if (change < 0) return
    setPayLoading(true)
    try {
      const { data: trx, error: trxError } = await supabase
        .from('transactions')
        .insert({ total_amount: cartTotal, cash_given: cashGiven, change_amount: change })
        .select().single()
      if (trxError) throw trxError

      const items = cart.map(i => ({
        transaction_id: trx.id,
        product_id: i.id,
        product_name: i.name,
        product_category: i.category,
        price_at_time: i.price,
        quantity: i.qty,
        subtotal: i.price * i.qty,
      }))
      const { error: itemsError } = await supabase.from('transaction_items').insert(items)
      if (itemsError) throw itemsError

      for (const item of cart) {
        const product = products.find(p => p.id === item.id)
        await supabase.from('products').update({ stock: product.stock - item.qty }).eq('id', item.id)
      }

      toast.success('Transaksi berhasil!')
      setCart([]); setCashInput(''); setPayModal(false); setShowCartSheet(false)
      loadProducts()
    } catch (err) {
      toast.error('Gagal menyimpan transaksi')
    }
    setPayLoading(false)
  }

  async function handleLogout() { await supabase.auth.signOut() }

  // CART CONTENT — shared between sidebar and bottom sheet
  const CartContent = () => (
    <>
      <div className="flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-300 gap-2 p-8 min-h-32">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
            </svg>
            <span className="text-xs text-center text-neutral-400">Klik produk untuk menambahkan</span>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {cart.map(item => (
              <div key={item.id} className="px-4 py-3 flex items-start gap-3">
                <div className="w-8 h-8 bg-neutral-50 rounded-lg flex items-center justify-center text-base flex-shrink-0 overflow-hidden">
                  {item.photo_url
                    ? <img src={item.photo_url} alt={item.name} className="w-full h-full object-cover rounded-lg" />
                    : CATEGORY_ICONS[item.category] || '📦'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-neutral-800 leading-tight truncate">{item.name}</div>
                  <div className="text-xs text-neutral-400 mt-0.5">{formatRupiah(item.price)}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <button onClick={() => removeFromCart(item.id)} className="w-6 h-6 rounded-md border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-100 text-sm">−</button>
                    <span className="text-xs font-semibold w-4 text-center">{item.qty}</span>
                    <button onClick={() => addToCart(item)} className="w-6 h-6 rounded-md border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-100 text-sm">+</button>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-semibold text-neutral-800">{formatRupiah(item.price * item.qty)}</div>
                  <button onClick={() => deleteFromCart(item.id)} className="text-neutral-300 hover:text-red-400 transition-colors mt-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-neutral-200 p-4 flex-shrink-0">
        <div className="flex justify-between text-xs text-neutral-500 mb-1">
          <span>{cartCount} item</span>
          <span>{formatRupiah(cartTotal)}</span>
        </div>
        <div className="flex justify-between text-sm font-semibold text-neutral-900 mb-3">
          <span>Total</span>
          <span>{formatRupiah(cartTotal)}</span>
        </div>
        <button
          onClick={() => { setCashInput(''); setPayModal(true) }}
          disabled={cart.length === 0}
          className="w-full py-3 bg-neutral-900 text-white text-sm font-medium rounded-xl hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Bayar
        </button>
      </div>
    </>
  )

  return (
    <div className="h-screen flex flex-col bg-neutral-50 overflow-hidden">
      <Toaster position="top-center" toastOptions={{ duration: 2000 }} />

      {/* NAV */}
      <nav className="bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-neutral-900 rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
            </svg>
          </div>
          <span className="font-semibold text-neutral-900 text-sm">Sistem Kasir</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => navigate('/stok')} className="px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors">Stok</button>
          <button onClick={() => navigate('/laporan')} className="px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors">Laporan</button>
          <button onClick={handleLogout} className="px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100 rounded-lg transition-colors">Keluar</button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT — PRODUK */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* SEARCH + SCAN */}
          <div className="bg-white border-b border-neutral-200 px-4 py-3 flex gap-2 flex-shrink-0">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery && setShowDropdown(searchResults.length > 0)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="Cari barang..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-neutral-400 focus:bg-white transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-300 hidden md:block">F1</span>
              {showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  {searchResults.map(p => (
                    <button key={p.id}
                      onMouseDown={() => { addToCart(p); setSearchQuery(''); setShowDropdown(false); if (p.stock > 0) toast.success(`${p.name} ditambahkan`, { duration: 1000 }) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 transition-colors text-left">
                      <span className="text-lg">{CATEGORY_ICONS[p.category] || '📦'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-neutral-800 truncate">{p.name}</div>
                        <div className="text-xs text-neutral-400">{p.category} · Stok: {p.stock}</div>
                      </div>
                      <div className="text-sm font-medium text-neutral-700 flex-shrink-0">{formatRupiah(p.price)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowScanner(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium rounded-xl transition-colors flex-shrink-0"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              <span className="hidden sm:inline">Scan</span>
            </button>
          </div>

          {/* CATEGORY TABS */}
          <div className="bg-white border-b border-neutral-200 px-4 flex gap-2 overflow-x-auto flex-shrink-0 py-2">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeCategory === cat ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                {cat !== 'Semua' && <span className="mr-1">{CATEGORY_ICONS[cat]}</span>}
                {cat}
              </button>
            ))}
          </div>

          {/* PRODUCT GRID */}
          {/* Mobile: pb-24 to avoid FAB overlap, Desktop: no padding needed */}
          <div className="flex-1 overflow-y-auto p-3 pb-24 md:pb-3">
            {loading ? (
              <div className="flex items-center justify-center h-full text-neutral-400 text-sm">Memuat produk...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-neutral-400 gap-2">
                <span className="text-3xl">📦</span>
                <span className="text-sm">Tidak ada produk</span>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-3">
                {filteredProducts.map(product => (
                  <button key={product.id}
                    onClick={() => { addToCart(product); if (product.stock > 0) toast.success(`${product.name} ditambahkan`, { duration: 1000 }) }}
                    disabled={product.stock === 0}
                    className={`bg-white border rounded-xl p-2 md:p-3 text-center transition-all active:scale-95 ${product.stock === 0 ? 'opacity-40 cursor-not-allowed border-neutral-100' : 'border-neutral-200 hover:border-neutral-300 cursor-pointer hover:shadow-sm'}`}>
                    {product.photo_url ? (
                      <img src={product.photo_url} alt={product.name} className="w-full aspect-square object-cover rounded-lg mb-2" />
                    ) : (
                      <div className="w-full aspect-square bg-neutral-50 rounded-lg mb-2 flex items-center justify-center text-2xl md:text-3xl">
                        {CATEGORY_ICONS[product.category] || '📦'}
                      </div>
                    )}
                    <div className="text-xs font-medium text-neutral-800 leading-tight mb-1 line-clamp-2">{product.name}</div>
                    <div className="text-xs font-semibold text-neutral-900">{formatRupiah(product.price)}</div>
                    <div className={`text-xs mt-0.5 ${product.stock <= 5 ? 'text-orange-500' : 'text-neutral-400'}`}>Stok: {product.stock}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* DESKTOP CART SIDEBAR — hidden on mobile */}
        <div className="hidden md:flex w-72 lg:w-80 bg-white border-l border-neutral-200 flex-col flex-shrink-0">
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-600">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              <span className="text-sm font-semibold text-neutral-900">Keranjang</span>
              {cartCount > 0 && (
                <span className="bg-neutral-900 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{cartCount}</span>
              )}
            </div>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-xs text-neutral-400 hover:text-red-500 transition-colors">Kosongkan</button>
            )}
          </div>
          <CartContent />
        </div>
      </div>

      {/* MOBILE FLOATING CART BUTTON — only on mobile */}
      <div className="md:hidden fixed bottom-4 left-4 right-4 z-30">
        <button
          onClick={() => setShowCartSheet(true)}
          className="w-full flex items-center justify-between px-5 py-3.5 bg-neutral-900 text-white rounded-2xl shadow-lg active:scale-98 transition-transform"
        >
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
            </svg>
            <span className="text-sm font-medium">Keranjang</span>
            {cartCount > 0 && (
              <span className="bg-white text-neutral-900 text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">{cartCount}</span>
            )}
          </div>
          <span className="text-sm font-semibold">{formatRupiah(cartTotal)}</span>
        </button>
      </div>

      {/* MOBILE CART BOTTOM SHEET */}
      {showCartSheet && (
        <div className="md:hidden fixed inset-0 z-40">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCartSheet(false)} />
          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-900">Keranjang</span>
                {cartCount > 0 && (
                  <span className="bg-neutral-900 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{cartCount}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {cart.length > 0 && (
                  <button onClick={clearCart} className="text-xs text-neutral-400 hover:text-red-500 transition-colors">Kosongkan</button>
                )}
                <button onClick={() => setShowCartSheet(false)} className="w-7 h-7 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
            <CartContent />
          </div>
        </div>
      )}

      {/* CAMERA SCANNER */}
      {showScanner && (
        <BarcodeScanner onDetected={handleCameraScan} onClose={() => setShowScanner(false)} />
      )}

      {/* PAYMENT MODAL */}
      {payModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xs p-6 shadow-xl">
            <h2 className="text-base font-semibold text-neutral-900 mb-4">Proses Pembayaran</h2>
            <div className="bg-neutral-50 rounded-xl p-3 mb-4 space-y-1 max-h-36 overflow-y-auto">
              {cart.map(item => (
                <div key={item.id} className="flex justify-between text-xs text-neutral-600">
                  <span className="truncate mr-2">{item.name} ×{item.qty}</span>
                  <span className="flex-shrink-0">{formatRupiah(item.price * item.qty)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-semibold text-neutral-900 mb-4">
              <span>Total</span><span>{formatRupiah(cartTotal)}</span>
            </div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5">Uang Diterima (Rp)</label>
            <input type="number" value={cashInput} onChange={e => setCashInput(e.target.value)} placeholder="0" autoFocus
              className="w-full px-3 py-2.5 text-sm border border-neutral-200 rounded-xl outline-none focus:border-neutral-400 bg-neutral-50 focus:bg-white transition-colors mb-3" />
            <div className={`flex justify-between text-sm rounded-xl px-3 py-2 mb-4 ${change >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              <span className="font-medium">Kembalian</span>
              <span className="font-semibold">{cashInput ? formatRupiah(Math.abs(change)) : '—'}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPayModal(false)} className="flex-1 py-2.5 border border-neutral-200 text-sm text-neutral-600 rounded-xl hover:bg-neutral-50 transition-colors">Batal</button>
              <button onClick={handlePayment} disabled={change < 0 || !cashInput || payLoading}
                className="flex-1 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-xl hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                {payLoading ? 'Memproses...' : 'Konfirmasi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}