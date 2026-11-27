import React, { useState, useEffect } from 'react';
import API from '../api/axios';
import { AlertTriangle, Package, X, Bell } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { formatCurrency } from '../utils/formatting';

const LowStockAlert = () => {
  const { t } = useLanguage();
  const [lowStockItems, setLowStockItems] = useState([]);
  const [showAlert, setShowAlert] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLowStock();
    const interval = setInterval(fetchLowStock, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchLowStock = async () => {
    try {
      const response = await API.get('/ingredients/low-stock');
      setLowStockItems(response.data.data || []);
    } catch (err) {
      console.error('Fetch low stock error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;
  if (lowStockItems.length === 0) return null;
  if (!showAlert) return null;

  return (
    <div className="bg-yellow-500/10 border-l-4 border-yellow-500 rounded-r-xl p-4 mb-4">
      <div className="flex justify-between items-start">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-yellow-500 mt-0.5" size={20} />
          <div>
            <h3 className="text-yellow-500 font-semibold flex items-center gap-2">
              {t('lowStockAlert')}
              <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded-full">
                {lowStockItems.length} {t('items')}
              </span>
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
              {t('lowStockDescription')}
            </p>
            <div className="mt-3 space-y-2">
              {lowStockItems.slice(0, 5).map(item => (
                <div key={item.id} className="flex items-center gap-2 text-sm">
                  <Package size={14} className="text-gray-500" />
                  <span className="text-gray-900 dark:text-white">{item.name}</span>
                  <span className="text-red-400">
                    {item.quantity} {item.unit} {t('left')}
                  </span>
                  <span className="text-gray-500">
                    ({t('min')}: {item.min_stock})
                  </span>
                </div>
              ))}
              {lowStockItems.length > 5 && (
                <p className="text-gray-500 text-xs mt-2">
                  +{lowStockItems.length - 5} {t('moreItems')}
                </p>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowAlert(false)}
          className="text-gray-500 hover:text-gray-500 dark:text-gray-400"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default LowStockAlert;
