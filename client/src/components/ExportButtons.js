import React from 'react';
import { FileText, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useLanguage } from '../context/LanguageContext';

const ExportButtons = ({ data, filename, type = 'both' }) => {
  const { t } = useLanguage();
  
  const exportToExcel = function() {
    if (!data || data.length === 0) {
      alert(t('noDataToExport'));
      return;
    }
    
    try {
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, t('report'));
      XLSX.writeFile(wb, filename + '.xlsx');
    } catch (error) {
      console.error('Excel export error:', error);
      alert(t('exportFailed'));
    }
  };

  const exportToPDF = function() {
    if (!data || data.length === 0) {
      alert(t('noDataToExport'));
      return;
    }
    
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      
      doc.setFontSize(16);
      doc.text(filename, 14, 15);
      doc.setFontSize(9);
      doc.text(t('generated') + ': ' + new Date().toLocaleString(), 14, 25);
      
      const tableColumn = Object.keys(data[0]);
      const tableRows = data.map(function(item) { return Object.values(item); });
      
      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 35,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 2,
          valign: 'middle',
          halign: 'center'
        },
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center'
        }
      });
      
      doc.save(filename + '.pdf');
      
    } catch (error) {
      console.error('PDF export error:', error);
      alert(t('pdfExportError') + ': ' + error.message);
    }
  };

  return (
    <div className="flex gap-2">
      {(type === 'excel' || type === 'both') && (
        <button
          onClick={exportToExcel}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl flex items-center gap-2 transition"
        >
          <FileSpreadsheet size={16} />
          {t('exportExcel')}
        </button>
      )}
      {(type === 'pdf' || type === 'both') && (
        <button
          onClick={exportToPDF}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl flex items-center gap-2 transition"
        >
          <FileText size={16} />
          {t('exportPDF')}
        </button>
      )}
    </div>
  );
};

export default ExportButtons;
