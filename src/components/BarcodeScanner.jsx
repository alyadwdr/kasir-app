import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library'

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const [error, setError] = useState('')
  const [cameras, setCameras] = useState([])
  const [selectedCamera, setSelectedCamera] = useState('')
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    readerRef.current = reader

    reader.listVideoInputDevices().then(devices => {
      setCameras(devices)
      // Prefer back camera on mobile
      const back = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear') || d.label.toLowerCase().includes('environment'))
      const chosen = back?.deviceId || devices[0]?.deviceId || ''
      setSelectedCamera(chosen)
    }).catch(() => setError('Tidak bisa mengakses kamera'))

    return () => {
      reader.reset()
    }
  }, [])

  useEffect(() => {
    if (!selectedCamera || !videoRef.current) return
    startScan(selectedCamera)
  }, [selectedCamera])

  function startScan(deviceId) {
    if (!readerRef.current || !videoRef.current) return
    readerRef.current.reset()
    setScanning(true)
    setError('')

    readerRef.current.decodeFromVideoDevice(deviceId, videoRef.current, (result, err) => {
      if (result) {
        onDetected(result.getText())
        readerRef.current.reset()
        setScanning(false)
      }
      if (err && !(err instanceof NotFoundException)) {
        // NotFoundException is normal (no barcode in frame yet), ignore it
      }
    }).catch(e => {
      setError('Gagal mengakses kamera. Pastikan izin kamera sudah diberikan.')
      setScanning(false)
    })
  }

  function switchCamera(deviceId) {
    readerRef.current?.reset()
    setSelectedCamera(deviceId)
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-neutral-100">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Scan Barcode</h2>
            <p className="text-xs text-neutral-400 mt-0.5">Arahkan kamera ke barcode produk</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 text-neutral-500 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Camera view */}
        <div className="relative bg-black" style={{ aspectRatio: '4/3' }}>
          <video ref={videoRef} className="w-full h-full object-cover" />

          {/* Scan overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-52 h-32">
              {/* Corner guides */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white rounded-br" />
              {/* Scan line */}
              {scanning && (
                <div className="absolute inset-x-0 top-1/2 h-0.5 bg-red-400 opacity-80 animate-pulse" />
              )}
            </div>
          </div>

          {/* Error overlay */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-center px-6">
                <p className="text-white text-sm mb-3">{error}</p>
                <button onClick={() => startScan(selectedCamera)} className="px-4 py-2 bg-white text-neutral-900 text-xs font-medium rounded-lg">
                  Coba Lagi
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Camera switcher */}
        {cameras.length > 1 && (
          <div className="px-4 py-3 border-t border-neutral-100">
            <label className="block text-xs text-neutral-500 mb-1.5">Pilih Kamera</label>
            <select
              value={selectedCamera}
              onChange={e => switchCamera(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-xl outline-none focus:border-neutral-400 bg-neutral-50"
            >
              {cameras.map(c => (
                <option key={c.deviceId} value={c.deviceId}>{c.label || `Kamera ${c.deviceId.slice(0, 8)}`}</option>
              ))}
            </select>
          </div>
        )}

        <div className="px-4 py-3 border-t border-neutral-100">
          <button onClick={onClose} className="w-full py-2 text-sm text-neutral-600 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors">
            Batal
          </button>
        </div>
      </div>
    </div>
  )
}