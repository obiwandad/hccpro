export default function RicezioneRapida({ onComplete, onCancel }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">⚡ Ricezione rapida</h2>
            <p className="text-sm text-gray-500 mt-1">
              Questa sezione non è ancora implementata. Puoi comunque usare la modalità singola.
            </p>
          </div>
          <button
            type="button"
            className="text-gray-400 hover:text-gray-600 text-xl font-bold"
            onClick={onCancel}
          >
            ×
          </button>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-2xl font-semibold text-sm transition-colors"
            onClick={onCancel}
          >
            Annulla
          </button>
          <button
            type="button"
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-2xl font-semibold text-sm transition-colors"
            onClick={onComplete}
          >
            Continua
          </button>
        </div>
      </div>
    </div>
  )
}
