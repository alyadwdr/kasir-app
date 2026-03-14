import { useEffect, useRef, useState } from 'react'

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const detectorRef = useRef(null)
  const animFrameRef = useRef(null)
  const [facingMode, setFacingMode] = useState('environment') // 'environment' = belakang, 'user' = depan
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [detected, setDetected] = useState(false)

  useEffect(() => {
    startCamera(facingMode)
    return () => stopCamera()
  }, [facingMode])

  async function startCamera(facing) {
    stopCamera()
    setError('')
    setScanning(false)
    setDetected(false)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          setScanning(true)
          initDetector()
        }
      }
    } catch (err) {
      console.error(err)
      if (err.name === 'NotAllowedError') {
        setError('Izin kamera ditolak. Buka pengaturan browser dan izinkan akses kamera.')
      } else if (err.name === 'NotFoundError') {
        setError('Kamera tidak ditemukan di perangkat ini.')
      } else {
        setError('Gagal mengakses kamera: ' + err.message)
      }
    }
  }

  async function initDetector() {
    // Gunakan BarcodeDetector API (native browser) jika tersedia
    if ('BarcodeDetector' in window) {
      try {
        detectorRef.current = new window.BarcodeDetector({
          formats: [
            'ean_13', 'ean_8', 'upc_a', 'upc_e',
            'code_128', 'code_39', 'code_93',
            'qr_code', 'data_matrix', 'itf',
          ]
        })
        scanLoop()
        return
      } catch (e) {
        console.warn('BarcodeDetector error, falling back to ZXing', e)
      }
    }

    // Fallback: ZXing library
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      detectorRef.current = { type: 'zxing', reader }

      if (videoRef.current) {
        reader.decodeFromVideoElement(videoRef.current, (result, err) => {
          if (result && !detected) {
            handleDetected(result.getText())
          }
        })
      }
    } catch (e) {
      setError('Gagal memuat library scanner. Coba refresh halaman.')
    }
  }

  function scanLoop() {
    if (!detectorRef.current || !videoRef.current || videoRef.current.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(scanLoop)
      return
    }
    detectorRef.current.detect(videoRef.current).then(barcodes => {
      if (barcodes.length > 0 && !detected) {
        handleDetected(barcodes[0].rawValue)
      } else {
        animFrameRef.current = requestAnimationFrame(scanLoop)
      }
    }).catch(() => {
      animFrameRef.current = requestAnimationFrame(scanLoop)
    })
  }

  function handleDetected(code) {
    setDetected(true)
    setScanning(false)
    cancelAnimationFrame(animFrameRef.current)
    stopCamera()
    onDetected(code)
  }

  function stopCamera() {
    cancelAnimationFrame(animFrameRef.current)
    if (detectorRef.current?.type === 'zxing') {
      try { detectorRef.current.reader.reset() } catch (e) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  const isFront = facingMode === 'user'

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-neutral-100">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Scan Barcode</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              {isFront ? 'Kamera depan — tampilan dicerminkan' : 'Arahkan kamera ke barcode'}
            </p>
          </div>
          <button onClick={() => { stopCamera(); onClose() }}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 text-neutral-500 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Camera */}
        <div className="relative bg-black" style={{ aspectRatio: '4/3' }}>
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            // Mirror kamera depan agar orientasi natural
            style={{ transform: isFront ? 'scaleX(-1)' : 'none' }}
          />

          {/* Scan overlay guide */}
          {!error && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-56 h-36">
                {/* Dimmed border area */}
                <div className="absolute inset-0 rounded-lg border-2 border-white/40" />
                {/* Corner guides */}
                <div className="absolute top-0 left-0 w-7 h-7 border-t-3 border-l-3 border-white rounded-tl-md"
                  style={{ borderTopWidth: 3, borderLeftWidth: 3 }} />
                <div className="absolute top-0 right-0 w-7 h-7 border-t-3 border-r-3 border-white rounded-tr-md"
                  style={{ borderTopWidth: 3, borderRightWidth: 3 }} />
                <div className="absolute bottom-0 left-0 w-7 h-7 border-b-3 border-l-3 border-white rounded-bl-md"
                  style={{ borderBottomWidth: 3, borderLeftWidth: 3 }} />
                <div className="absolute bottom-0 right-0 w-7 h-7 border-b-3 border-r-3 border-white rounded-br-md"
                  style={{ borderBottomWidth: 3, borderRightWidth: 3 }} />
                {/* Scan line animation */}
                {scanning && (
                  <div className="absolute inset-x-2 top-1/2 h-px bg-red-400"
                    style={{ animation: 'scanline 1.5s ease-in-out infinite' }} />
                )}
              </div>
            </div>
          )}

          {/* Error overlay */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6">
              <div className="text-center">
                <svg className="mx-auto mb-3 text-neutral-400" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                  <line x1="12" y1="11" x2="12" y2="13"/><line x1="12" y1="15" x2="12.01" y2="15"/>
                </svg>
                <p className="text-white text-xs mb-4 leading-relaxed">{error}</p>
                <button onClick={() => startCamera(facingMode)}
                  className="px-4 py-2 bg-white text-neutral-900 text-xs font-medium rounded-lg">
                  Coba Lagi
                </button>
              </div>
            </div>
          )}

          {/* Scanning status badge */}
          {scanning && !error && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Scanning...
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-4 py-3 flex items-center gap-2 border-t border-neutral-100">
          {/* Toggle kamera depan/belakang */}
          <button
            onClick={() => setFacingMode(f => f === 'environment' ? 'user' : 'environment')}
            className="flex items-center gap-2 px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium rounded-xl transition-colors flex-shrink-0"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            {isFront ? 'Pakai Belakang' : 'Pakai Depan'}
          </button>

          <button
            onClick={() => { stopCamera(); onClose() }}
            className="flex-1 py-2 text-sm text-neutral-600 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors"
          >
            Batal
          </button>
        </div>

        <style>{`
          @keyframes scanline {
            0%, 100% { top: 20%; opacity: 1; }
            50% { top: 80%; opacity: 0.6; }
          }
        `}</style>
      </div>
    </div>
  )
}