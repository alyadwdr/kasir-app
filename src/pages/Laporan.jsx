import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import toast, { Toaster } from 'react-hot-toast'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

function formatRupiah(n) {
  return 'Rp ' + Number(n).toLocaleString('id-ID')
}
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
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
  const [chartData, setChartData] = useState([])
  const [chartPeriod, setChartPeriod] = useState('minggu')
  const [tooltip, setTooltip] = useState(null)

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
  }

  async function loadChartData() {
    const days = chartPeriod === 'minggu' ? 7 : 30
    const start = new Date()
    start.setDate(start.getDate() - (days - 1))
    start.setHours(0, 0, 0, 0)
    const { data } = await supabase.from('transactions').select('created_at, total_amount').gte('created_at', start.toISOString()).order('created_at')
    const map = {}
    for (let i = 0; i < days; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i)
      const key = d.toISOString().split('T')[0]
      map[key] = 0
    }
    ;(data || []).forEach(t => { const key = t.created_at.split('T')[0]; if (map[key] !== undefined) map[key] += t.total_amount })
    setChartData(Object.entries(map).map(([date, amount]) => ({ date, amount })))
  }

  const totalPemasukan = transactions.reduce((s, t) => s + t.total_amount, 0)
  const totalPengeluaran = expenses.reduce((s, e) => s + e.amount, 0)
  const labaBersih = totalPemasukan - totalPengeluaran
  const totalTransaksi = transactions.length
  const rataPerTransaksi = totalTransaksi > 0 ? Math.round(totalPemasukan / totalTransaksi) : 0
  const maxChart = Math.max(...chartData.map(d => d.amount), 1)

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
    const trxRows = transactions.map(t => ({ 'Tanggal': formatDateTime(t.created_at), 'Total': t.total_amount, 'Bayar': t.cash_given, 'Kembalian': t.change_amount, 'Item': t.transaction_items?.length || 0 }))
    const expRows = expenses.map(e => ({ 'Tanggal': e.expense_date, 'Keterangan': e.description, 'Jumlah': e.amount }))
    const summaryRows = [{ 'Keterangan': 'Total Pemasukan', 'Jumlah': totalPemasukan }, { 'Keterangan': 'Total Pengeluaran', 'Jumlah': totalPengeluaran }, { 'Keterangan': 'Laba Bersih', 'Jumlah': labaBersih }, { 'Keterangan': 'Jumlah Transaksi', 'Jumlah': totalTransaksi }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Ringkasan')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trxRows), 'Transaksi')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expRows), 'Pengeluaran')
    const periodLabel = period === 'hari' ? 'hari-ini' : period === 'minggu' ? '7-hari' : period === 'bulan' ? 'bulan-ini' : `${customStart}_${customEnd}`
    XLSX.writeFile(wb, `laporan-kasir-${periodLabel}.xlsx`)
    toast.success('Export Excel berhasil')
  }

  function exportPDF() {
    const doc = new jsPDF()
    const periodLabel = period === 'hari' ? 'Hari Ini' : period === 'minggu' ? '7 Hari Terakhir' : period === 'bulan' ? 'Bulan Ini' : `${customStart} s/d ${customEnd}`
    doc.setFontSize(16); doc.text('Laporan Keuangan', 14, 18)
    doc.setFontSize(10); doc.setTextColor(120)
    doc.text(`Periode: ${periodLabel}`, 14, 26)
    doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, 14, 32)
    doc.setTextColor(0); doc.setFontSize(11); doc.text('Ringkasan', 14, 44)
    autoTable(doc, { startY: 48, head: [['Keterangan', 'Jumlah']], body: [['Total Pemasukan', formatRupiah(totalPemasukan)], ['Total Pengeluaran', formatRupiah(totalPengeluaran)], ['Laba Bersih', formatRupiah(labaBersih)], ['Jumlah Transaksi', totalTransaksi], ['Rata-rata per Transaksi', formatRupiah(rataPerTransaksi)]], styles: { fontSize: 9 }, headStyles: { fillColor: [30, 30, 30] } })
    doc.setFontSize(11); doc.text('Daftar Transaksi', 14, doc.lastAutoTable.finalY + 12)
    autoTable(doc, { startY: doc.lastAutoTable.finalY + 16, head: [['Tanggal', 'Total', 'Bayar', 'Kembalian']], body: transactions.map(t => [formatDateTime(t.created_at), formatRupiah(t.total_amount), formatRupiah(t.cash_given), formatRupiah(t.change_amount)]), styles: { fontSize: 8 }, headStyles: { fillColor: [30, 30, 30] } })
    if (expenses.length > 0) {
      doc.setFontSize(11); doc.text('Daftar Pengeluaran', 14, doc.lastAutoTable.finalY + 12)
      autoTable(doc, { startY: doc.lastAutoTable.finalY + 16, head: [['Tanggal', 'Keterangan', 'Jumlah']], body: expenses.map(e => [e.expense_date, e.description, formatRupiah(e.amount)]), styles: { fontSize: 8 }, headStyles: { fillColor: [30, 30, 30] } })
    }
    const periodFile = period === 'hari' ? 'hari-ini' : period === 'minggu' ? '7-hari' : period === 'bulan' ? 'bulan-ini' : `${customStart}_${customEnd}`
    doc.save(`laporan-kasir-${periodFile}.pdf`)
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

        {/* CHART — FIXED */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-neutral-800">Grafik Omset</h2>
            <div className="flex gap-1">
              {[{ key: 'minggu', label: '7 Hari' }, { key: 'bulan', label: '30 Hari' }].map(p => (
                <button key={p.key} onClick={() => setChartPeriod(p.key)}
                  className={`px-3 py-1 rounded-full text-xs transition-colors ${chartPeriod === p.key ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative" style={{ height: '140px' }}>
            <div className="absolute bottom-6 left-0 right-0 border-b border-neutral-100" />
            <div className="absolute inset-x-0 top-0 bottom-6 flex items-end gap-1">
              {chartData.map((d, i) => {
                const isToday = d.date === new Date().toISOString().split('T')[0]
                const pct = d.amount === 0 ? 0 : Math.max(4, Math.round((d.amount / maxChart) * 100))
                return (
                  <div key={d.date} className="flex-1 flex flex-col justify-end items-center h-full relative"
                    onMouseEnter={() => setTooltip(i)}
                    onMouseLeave={() => setTooltip(null)}>
                    {tooltip === i && (
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-neutral-900 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap z-20 pointer-events-none">
                        {formatRupiah(d.amount)}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900" />
                      </div>
                    )}
                    <div
                      className={`w-full rounded-t-sm transition-all duration-300 ${isToday ? 'bg-neutral-800' : 'bg-neutral-300 hover:bg-neutral-500'}`}
                      style={{ height: pct === 0 ? '2px' : `${pct}%` }}
                    />
                  </div>
                )
              })}
            </div>
            <div className="absolute bottom-0 inset-x-0 flex gap-1">
              {chartData.map((d) => {
                const label = chartPeriod === 'minggu'
                  ? ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][new Date(d.date + 'T12:00:00').getDay()]
                  : new Date(d.date + 'T12:00:00').getDate()
                return (
                  <div key={d.date} className="flex-1 text-center">
                    <span className="text-xs text-neutral-400">{label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                <input type="text" value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))} placeholder="misal: Kulakan mainan, Bayar listrik" className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-neutral-400 bg-neutral-50 focus:bg-white transition-colors" />
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