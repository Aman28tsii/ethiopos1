import React, { useState } from 'react';
import { Printer, Download, QrCode, Copy, Utensils } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { QRCodeCanvas } from 'qrcode.react';

const PrintQRCodes = () => {
  const { t } = useLanguage();
  const [tables] = useState([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const baseUrl = window.location.origin;

  const printPage = () => {
    window.print();
  };

  const copyUrl = (url) => {
    navigator.clipboard.writeText(url);
    alert(t('urlCopied'));
  };

  const downloadQR = (tableNumber) => {
    const canvas = document.getElementById(`qr-canvas-${tableNumber}`);
    if (canvas) {
      const link = document.createElement('a');
      link.download = `table-${tableNumber}-qr.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white">{t('printQRCodes')}</h1>
          <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 mt-1">{t('generateAndPrintQRCodes')}</p>
        </div>
        <button
          onClick={printPage}
          className="bg-blue-600 hover:bg-blue-700 text-gray-900 dark:text-gray-900 dark:text-white px-4 py-2 rounded-xl flex items-center gap-2 transition"
        >
          <Printer size={18} />
          {t('printAll')}
        </button>
      </div>

      {/* QR Codes Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 print:grid-cols-5">
        {tables.map(table => (
          <div 
            key={table} 
            className="bg-white dark:bg-white dark:bg-white dark:bg-gray-800 rounded-xl p-4 text-center border border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all print:shadow-none print:border print:border-gray-300"
          >
            {/* QR Code */}
            <div className="bg-gray-50 dark:bg-gray-100 dark:bg-gray-700 p-3 rounded-lg mb-3">
              <QRCodeCanvas
                id={`qr-canvas-${table}`}
                value={`${baseUrl}/qr-menu?table=${table}`}
                size={150}
                level="H"
                includeMargin={true}
                className="mx-auto"
              />
            </div>
            
            {/* Table Info */}
            <p className="font-bold text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white text-lg">{t('table')} {table}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 mt-1 break-all hidden print:block">
              {baseUrl}/qr-menu?table={table}
            </p>
            
            {/* Actions (hidden when printing) */}
            <div className="mt-3 flex gap-2 justify-center print:hidden">
              <button
                onClick={() => copyUrl(`${baseUrl}/qr-menu?table=${table}`)}
                className="text-xs bg-gray-100 dark:bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 px-2 py-1 rounded flex items-center gap-1 hover:bg-gray-200 dark:hover:bg-gray-200 dark:hover:bg-gray-600 transition"
              >
                <Copy size={12} />
                {t('copyUrl')}
              </button>
              <button
                onClick={() => downloadQR(table)}
                className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-1 rounded flex items-center gap-1 hover:bg-blue-200 dark:hover:bg-blue-800/50 transition"
              >
                <Download size={12} />
                {t('download')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 print:hidden">
        <p className="text-blue-700 dark:text-blue-400 text-sm flex items-center gap-2">
          <QrCode size={16} />
          💡 {t('qrPrintInstructions')}
        </p>
      </div>

      {/* Print Instructions (visible only when printing) */}
      <div className="hidden print:block text-center mt-8">
        <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm">
          {t('cutAndPlaceOnTables')}
        </p>
      </div>
    </div>
  );
};

export default PrintQRCodes;