import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import toast, { Toaster } from 'react-hot-toast'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

function formatRupiah(n) { return 'Rp ' + Number(n).toLocaleString('id-ID') }
function formatDate(d) { return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) }
function formatDateTime(d) { return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }

function getDateRange(period, customStart, customEnd) {
  const now = new Date()
  let start, end
  end = new Date(now); end.setHours(23, 59, 59, 999)
  if (period === 'hari') { start = new Date(now); start.setHours(0, 0, 0, 0) }
  else if (period === 'minggu') { start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0) }
  else if (period === 'bulan') { start = new Date(now.getFullYear(), now.getMonth(), 1) }
  else if (period === 'custom') { start = new Date(customStart); start.setHours(0, 0, 0, 0); end = new Date(customEnd); end.setHours(23, 59, 59, 999) }
  return { start, end }
}

// Line chart SVG component
function LineChart({ incomeData, expenseData, labels }) {
  const [tooltip, setTooltip] = useState(null)
  const svgRef = useRef(null)
  const W = 600, H = 140, PAD = { t: 10, r: 10, b: 28, l: 48 }
  const chartW = W - PAD.l - PAD.r
  const chartH = H - PAD.t - PAD.b
  const n = labels.length

  const allVals = [...incomeData, ...expenseData].filter(v => v > 0)
  const maxVal = allVals.length > 0 ? Math.max(...allVals) : 1

  function xPos(i) { return PAD.l + (i / Math.max(n - 1, 1)) * chartW }
  function yPos(v) { return PAD.t + chartH - (v / maxVal) * chartH }

  function makePath(data) {
    if (data.every(v => v === 0)) return ''
    const pts = data.map((v, i) => `${xPos(i)},${yPos(v)}`)
    return 'M' + pts.join(' L')
  }

  function makeArea(data, color) {
    if (data.every(v => v === 0)) return ''
    const top = data.map((v, i) => `${xPos(i)},${yPos(v)}`).join(' L')
    const bot = [...data].reverse().map((_, ri) => {
      const i = data.length - 1 - ri
      return `${xPos(i)},${PAD.t + chartH}`
    }).join(' L')
    return `M${top} L${bot} Z`
  }

  // y-axis ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxVal * f))

  function handleMouseMove(e) {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (W / rect.width)
    const relX = x - PAD.l
    const idx = Math.round(relX / (chartW / Math.max(n - 1, 1)))
    if (idx >= 0 && idx < n) setTooltip(idx)
  }

  return (
    <div className="relative w-full">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full"
        onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}>

        {/* Grid lines */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={yPos(t)} x2={W - PAD.r} y2={yPos(t)} stroke="#e5e5e5" strokeWidth="0.8" />
            <text x={PAD.l - 6} y={yPos(t) + 4} textAnchor="end" fontSize="9" fill="#a3a3a3">
              {t >= 1000000 ? (t / 1000000).toFixed(1) + 'jt' : t >= 1000 ? (t / 1000).toFixed(0) + 'rb' : t}
            </text>
          </g>
        ))}

        {/* Area fills */}
        {makePath(incomeData) && (
          <path d={makeArea(incomeData)} fill="#16a34a" fillOpacity="0.08" />
        )}
        {makePath(expenseData) && (
          <path d={makeArea(expenseData)} fill="#dc2626" fillOpacity="0.08" />
        )}

        {/* Lines */}
        {makePath(incomeData) && (
          <path d={makePath(incomeData)} fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {makePath(expenseData) && (
          <path d={makePath(expenseData)} fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Data points */}
        {incomeData.map((v, i) => v > 0 && (
          <circle key={i} cx={xPos(i)} cy={yPos(v)} r="3" fill="#16a34a" />
        ))}
        {expenseData.map((v, i) => v > 0 && (
          <circle key={i} cx={xPos(i)} cy={yPos(v)} r="3" fill="#dc2626" />
        ))}

        {/* Tooltip vertical line */}
        {tooltip !== null && (
          <line x1={xPos(tooltip)} y1={PAD.t} x2={xPos(tooltip)} y2={PAD.t + chartH} stroke="#737373" strokeWidth="1" strokeDasharray="3,3" />
        )}

        {/* X labels */}
        {labels.map((lbl, i) => (
          <text key={i} x={xPos(i)} y={H - 8} textAnchor="middle" fontSize="9" fill={tooltip === i ? '#171717' : '#a3a3a3'}
            fontWeight={tooltip === i ? '600' : '400'}>
            {lbl}
          </text>
        ))}
      </svg>

      {/* Tooltip box */}
      {tooltip !== null && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-neutral-900 text-white text-xs rounded-lg px-3 py-2 pointer-events-none whitespace-nowrap z-10"
          style={{ transform: `translateX(${tooltip < 3 ? '0%' : tooltip > labels.length - 3 ? '-100%' : '-50%'})`, left: `${(xPos(tooltip) / 600) * 100}%` }}>
          <div className="font-medium mb-1">{labels[tooltip]}</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            <span>{formatRupiah(incomeData[tooltip] || 0)}</span></div>
          <div className="flex items-center gap-1.5 mt-0.5"><span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
            <span>{formatRupiah(expenseData[tooltip] || 0)}</span></div>
        </div>
      )}
    </div>
  )
}

export default function Laporan() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('hari')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState([])
  const [expenses, setExpenses] = useState([])
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', date: new Date().toISOString().split('T')[0] })
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [deleteExpense, setDeleteExpense] = useState(null)
  const [chartPeriod, setChartPeriod] = useState('minggu')
  const [chartIncome, setChartIncome] = useState([])
  const [chartExpense, setChartExpense] = useState([])
  const [chartLabels, setChartLabels] = useState([])

  useEffect(() => { loadData() }, [period, customStart, customEnd])
  useEffect(() => { loadChartData() }, [chartPeriod])

  async function loadData() {
    if (period === 'custom' && (!customStart || !customEnd)) return
    setLoading(true)
    const { start, end } = getDateRange(period, customStart, customEnd)
    const [trxRes, expRes] = await Promise.all([
      supabase.from('transactions').select('*, transaction_items(*)').gte('created_at', start.toISOString()).lte('created_at', end.toISOString()).order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').gte('expense_date', start.toISOString().split('T')[0]).lte('expense_date', end.toISOString().split('T')[0]).order('expense_date', { ascending: false })
    ])
    setTransactions(trxRes.data || [])
    setExpenses(expRes.data || [])
    setLoading(false)
    // Refresh chart too when data changes
    loadChartData()
  }

  async function loadChartData() {
    const days = chartPeriod === 'minggu' ? 7 : 30
    const start = new Date()
    start.setDate(start.getDate() - (days - 1))
    start.setHours(0, 0, 0, 0)

    const [trxRes, expRes] = await Promise.all([
      supabase.from('transactions').select('created_at, total_amount').gte('created_at', start.toISOString()).order('created_at'),
      supabase.from('expenses').select('expense_date, amount').gte('expense_date', start.toISOString().split('T')[0]).order('expense_date')
    ])

    const incMap = {}, expMap = {}, lbls = []
    for (let i = 0; i < days; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i)
      const key = d.toISOString().split('T')[0]
      incMap[key] = 0; expMap[key] = 0
      const day = new Date(key + 'T12:00:00')
      lbls.push(chartPeriod === 'minggu'
        ? ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][day.getDay()]
        : String(day.getDate()))
    }

    ;(trxRes.data || []).forEach(t => { const k = t.created_at.split('T')[0]; if (k in incMap) incMap[k] += t.total_amount })
    ;(expRes.data || []).forEach(e => { const k = e.expense_date; if (k in expMap) expMap[k] += e.amount })

    setChartIncome(Object.values(incMap))
    setChartExpense(Object.values(expMap))
    setChartLabels(lbls)
  }

  const totalPemasukan = transactions.reduce((s, t) => s + t.total_amount, 0)
  const totalPengeluaran = expenses.reduce((s, e) => s + e.amount, 0)
  const labaBersih = totalPemasukan - totalPengeluaran
  const totalTransaksi = transactions.length
  const rataPerTransaksi = totalTransaksi > 0 ? Math.round(totalPemasukan / totalTransaksi) : 0

  async function handleAddExpense() {
    if (!expenseForm.description.trim()) { toast.error('Keterangan wajib diisi'); return }
    if (!expenseForm.amount || isNaN(expenseForm.amount)) { toast.error('Jumlah wajib diisi'); return }
    const { error } = await supabase.from('expenses').insert({ description: expenseForm.description.trim(), amount: parseInt(expenseForm.amount), expense_date: expenseForm.date })
    if (error) { toast.error('Gagal menyimpan pengeluaran'); return }
    toast.success('Pengeluaran dicatat')
    setExpenseForm({ description: '', amount: '', date: new Date().toISOString().split('T')[0] })
    setShowExpenseModal(false)
    loadData()
  }

  async function handleDeleteExpense(expense) {
    const { error } = await supabase.from('expenses').delete().eq('id', expense.id)
    if (error) { toast.error('Gagal menghapus'); return }
    toast.success('Pengeluaran dihapus')
    setDeleteExpense(null)
    loadData()
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { 'Keterangan': 'Total Pemasukan', 'Jumlah': totalPemasukan },
      { 'Keterangan': 'Total Pengeluaran', 'Jumlah': totalPengeluaran },
      { 'Keterangan': 'Laba Bersih', 'Jumlah': labaBersih },
      { 'Keterangan': 'Jumlah Transaksi', 'Jumlah': totalTransaksi },
    ]), 'Ringkasan')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      transactions.map(t => ({ 'Tanggal': formatDateTime(t.created_at), 'Total': t.total_amount, 'Bayar': t.cash_given, 'Kembalian': t.change_amount, 'Item': t.transaction_items?.length || 0 }))
    ), 'Transaksi')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      expenses.map(e => ({ 'Tanggal': e.expense_date, 'Keterangan': e.description, 'Jumlah': e.amount }))
    ), 'Pengeluaran')
    const lbl = period === 'hari' ? 'hari-ini' : period === 'minggu' ? '7-hari' : period === 'bulan' ? 'bulan-ini' : `${customStart}_${customEnd}`
    XLSX.writeFile(wb, `laporan-kasir-${lbl}.xlsx`)
    toast.success('Export Excel berhasil')
  }

  function exportPDF() {
    const doc = new jsPDF()
    const lbl = period === 'hari' ? 'Hari Ini' : period === 'minggu' ? '7 Hari Terakhir' : period === 'bulan' ? 'Bulan Ini' : `${customStart} s/d ${customEnd}`
    doc.setFontSize(16); doc.text('Laporan Keuangan', 14, 18)
    doc.setFontSize(10); doc.setTextColor(120)
    doc.text(`Periode: ${lbl}`, 14, 26)
    doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, 14, 32)
    doc.setTextColor(0); doc.setFontSize(11); doc.text('Ringkasan', 14, 44)
    autoTable(doc, { startY: 48, head: [['Keterangan', 'Jumlah']], body: [['Total Pemasukan', formatRupiah(totalPemasukan)], ['Total Pengeluaran', formatRupiah(totalPengeluaran)], ['Laba Bersih', formatRupiah(labaBersih)], ['Jumlah Transaksi', totalTransaksi], ['Rata-rata/Trx', formatRupiah(rataPerTransaksi)]], styles: { fontSize: 9 }, headStyles: { fillColor: [30, 30, 30] } })
    doc.setFontSize(11); doc.text('Daftar Transaksi', 14, doc.lastAutoTable.finalY + 12)
    autoTable(doc, { startY: doc.lastAutoTable.finalY + 16, head: [['Tanggal', 'Total', 'Bayar', 'Kembalian']], body: transactions.map(t => [formatDateTime(t.created_at), formatRupiah(t.total_amount), formatRupiah(t.cash_given), formatRupiah(t.change_amount)]), styles: { fontSize: 8 }, headStyles: { fillColor: [30, 30, 30] } })
    if (expenses.length > 0) {
      doc.setFontSize(11); doc.text('Daftar Pengeluaran', 14, doc.lastAutoTable.finalY + 12)
      autoTable(doc, { startY: doc.lastAutoTable.finalY + 16, head: [['Tanggal', 'Keterangan', 'Jumlah']], body: expenses.map(e => [e.expense_date, e.description, formatRupiah(e.amount)]), styles: { fontSize: 8 }, headStyles: { fillColor: [30, 30, 30] } })
    }
    const f = period === 'hari' ? 'hari-ini' : period === 'minggu' ? '7-hari' : period === 'bulan' ? 'bulan-ini' : `${customStart}_${customEnd}`
    doc.save(`laporan-kasir-${f}.pdf`)
    toast.success('Export PDF berhasil')
  }

  async function handleLogout() { await supabase.auth.signOut() }

  const PERIODS = [{ key: 'hari', label: 'Hari Ini' }, { key: 'minggu', label: '7 Hari' }, { key: 'bulan', label: 'Bulan Ini' }, { key: 'custom', label: 'Custom' }]

  return (
    <div className="min-h-screen bg-neutral-50">
      <Toaster position="top-center" toastOptions={{ duration: 2000 }} />
      <nav className="bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-neutral-900 rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          </div>
          <span className="font-semibold text-neutral-900 text-sm">Sistem Kasir</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => navigate('/kasir')} className="px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors">Kasir</button>
          <button onClick={() => navigate('/stok')} className="px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors">Stok</button>
          <button onClick={handleLogout} className="px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100 rounded-lg transition-colors">Keluar</button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900">Laporan Keuangan</h1>
            <p className="text-xs text-neutral-500 mt-0.5">Ringkasan pemasukan, pengeluaran, dan omset toko</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowExpenseModal(true)} className="px-3 py-2 text-xs border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 transition-colors">+ Pengeluaran</button>
            <button onClick={exportExcel} className="px-3 py-2 text-xs border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 transition-colors flex items-center gap-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Excel
            </button>
            <button onClick={exportPDF} className="px-3 py-2 text-xs bg-neutral-900 text-white rounded-xl hover:bg-neutral-700 transition-colors flex items-center gap-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              PDF
            </button>
          </div>
        </div>

        {/* Period filter */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${period === p.key ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
              {p.label}
            </button>
          ))}
          {period === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="px-2 py-1 text-xs border border-neutral-200 rounded-lg outline-none focus:border-neutral-400" />
              <span className="text-xs text-neutral-400">s/d</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="px-2 py-1 text-xs border border-neutral-200 rounded-lg outline-none focus:border-neutral-400" />
            </div>
          )}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Pemasukan', value: formatRupiah(totalPemasukan), color: 'text-green-600' },
            { label: 'Pengeluaran', value: formatRupiah(totalPengeluaran), color: 'text-red-500' },
            { label: 'Laba Bersih', value: formatRupiah(labaBersih), color: labaBersih >= 0 ? 'text-neutral-900' : 'text-red-500' },
            { label: 'Transaksi', value: totalTransaksi, color: 'text-neutral-900' },
            { label: 'Rata-rata/Trx', value: formatRupiah(rataPerTransaksi), color: 'text-neutral-900' },
          ].map((m, i) => (
            <div key={i} className={`bg-white rounded-xl border border-neutral-200 p-4 ${i === 4 ? 'col-span-2 lg:col-span-1' : ''}`}>
              <div className="text-xs text-neutral-500 mb-1">{m.label}</div>
              <div className={`text-lg font-semibold ${m.color}`}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Line Chart */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-800">Grafik Keuangan</h2>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-green-600 rounded" />
                  <span className="text-xs text-neutral-500">Pemasukan</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-red-500 rounded" />
                  <span className="text-xs text-neutral-500">Pengeluaran</span>
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              {[{ key: 'minggu', label: '7 Hari' }, { key: 'bulan', label: '30 Hari' }].map(p => (
                <button key={p.key} onClick={() => setChartPeriod(p.key)}
                  className={`px-3 py-1 rounded-full text-xs transition-colors ${chartPeriod === p.key ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {chartLabels.length > 0 && (
            <LineChart incomeData={chartIncome} expenseData={chartExpense} labels={chartLabels} />
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Transactions */}
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-100">
              <h2 className="text-sm font-semibold text-neutral-800">Riwayat Transaksi</h2>
            </div>
            {loading ? (
              <div className="py-12 text-center text-neutral-400 text-sm">Memuat...</div>
            ) : transactions.length === 0 ? (
              <div className="py-12 text-center text-neutral-400 text-sm">Tidak ada transaksi</div>
            ) : (
              <div className="divide-y divide-neutral-50 max-h-96 overflow-y-auto">
                {transactions.map(t => (
                  <div key={t.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-neutral-800">{formatDateTime(t.created_at)}</div>
                      <div className="text-xs text-neutral-400 mt-0.5">{t.transaction_items?.length || 0} item · Kembalian {formatRupiah(t.change_amount)}</div>
                    </div>
                    <div className="text-sm font-semibold text-green-600">+{formatRupiah(t.total_amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expenses */}
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-800">Pengeluaran</h2>
              <button onClick={() => setShowExpenseModal(true)} className="text-xs text-neutral-500 hover:text-neutral-800 transition-colors">+ Tambah</button>
            </div>
            {loading ? (
              <div className="py-12 text-center text-neutral-400 text-sm">Memuat...</div>
            ) : expenses.length === 0 ? (
              <div className="py-12 text-center text-neutral-400 text-sm">Tidak ada pengeluaran</div>
            ) : (
              <div className="divide-y divide-neutral-50 max-h-96 overflow-y-auto">
                {expenses.map(e => (
                  <div key={e.id} className="px-4 py-3 flex items-center justify-between group">
                    <div>
                      <div className="text-xs font-medium text-neutral-800">{e.description}</div>
                      <div className="text-xs text-neutral-400 mt-0.5">{formatDate(e.expense_date)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-semibold text-red-500">-{formatRupiah(e.amount)}</div>
                      <button onClick={() => setDeleteExpense(e)} className="text-neutral-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h2 className="text-base font-semibold text-neutral-900 mb-4">Tambah Pengeluaran</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Keterangan</label>
                <input type="text" value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))} placeholder="misal: Kulakan mainan" className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-neutral-400 bg-neutral-50 focus:bg-white transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Jumlah (Rp)</label>
                <input type="number" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-neutral-400 bg-neutral-50 focus:bg-white transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Tanggal</label>
                <input type="date" value={expenseForm.date} onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-neutral-400 bg-neutral-50 focus:bg-white transition-colors" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowExpenseModal(false)} className="flex-1 py-2.5 border border-neutral-200 text-sm text-neutral-600 rounded-xl hover:bg-neutral-50 transition-colors">Batal</button>
              <button onClick={handleAddExpense} className="flex-1 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-xl hover:bg-neutral-700 transition-colors">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {deleteExpense && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h2 className="text-base font-semibold text-neutral-900 mb-2">Hapus Pengeluaran?</h2>
            <p className="text-sm text-neutral-500 mb-6"><span className="font-medium text-neutral-800">"{deleteExpense.description}"</span> akan dihapus permanen.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteExpense(null)} className="flex-1 py-2.5 border border-neutral-200 text-sm text-neutral-600 rounded-xl hover:bg-neutral-50 transition-colors">Batal</button>
              <button onClick={() => handleDeleteExpense(deleteExpense)} className="flex-1 py-2.5 bg-red-500 text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors">Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}