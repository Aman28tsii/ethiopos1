import React, { useState, useEffect, memo } from 'react';
import { ChefHat, Wine, Layers } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const StationSelector = memo(({ user, onStationChange, initialStation }) => {
  const { t } = useLanguage();
  const [selectedStation, setSelectedStation] = useState(() => {
    const saved = localStorage.getItem('preferred_station');
    if (saved && ['kitchen', 'bar', 'both'].includes(saved)) return saved;
    if (initialStation && ['kitchen', 'bar', 'both'].includes(initialStation)) return initialStation;
    return user?.station_type || 'kitchen';
  });

  const stations = [
    { id: 'kitchen', icon: ChefHat, label: 'Kitchen Only', color: 'orange', description: 'Food items only', emoji: String.fromCodePoint(0x1F373) },
    { id: 'bar', icon: Wine, label: 'Bar Only', color: 'blue', description: 'Drink items only', emoji: String.fromCodePoint(0x1F37A) },
    { id: 'both', icon: Layers, label: 'Both Stations', color: 'purple', description: 'See all items', emoji: String.fromCodePoint(0x1F4CB) }
  ];

  const handleStationChange = (stationId) => {
    setSelectedStation(stationId);
    localStorage.setItem('preferred_station', stationId);
    if (onStationChange) {
      onStationChange(stationId);
    }
  };

  const getColorClasses = (stationId, isSelected) => {
    const colors = {
      kitchen: {
        selected: 'bg-orange-600 text-white shadow-lg',
        unselected: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-800/50'
      },
      bar: {
        selected: 'bg-blue-600 text-white shadow-lg',
        unselected: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/50'
      },
      both: {
        selected: 'bg-purple-600 text-white shadow-lg',
        unselected: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-800/50'
      }
    };
    return colors[stationId][isSelected ? 'selected' : 'unselected'];
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-gray-900 dark:text-white font-semibold text-sm flex items-center gap-2">
            <Layers size={16} className="text-purple-500" />
            {t('stationView') || 'Station View'}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 text-xs">
            {t('selectWhatToDisplay') || 'Select what orders to display'}
          </p>
        </div>
        <div className="flex gap-2">
          {stations.map(station => {
            const Icon = station.icon;
            const isSelected = selectedStation === station.id;
            return (
              <button
                key={station.id}
                onClick={() => handleStationChange(station.id)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${getColorClasses(station.id, isSelected)}`}
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{station.label}</span>
                <span className="sm:hidden">{station.emoji}</span>
              </button>
            );
          })}
        </div>
      </div>
      
      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">Currently viewing:</span>
          <span className={`font-semibold ${
            selectedStation === 'kitchen' ? 'text-orange-600 dark:text-orange-400' :
            selectedStation === 'bar' ? 'text-blue-600 dark:text-blue-400' :
            'text-purple-600 dark:text-purple-400'
          }`}>
            {selectedStation === 'kitchen' && String.fromCodePoint(0x1F373) + ' Kitchen Only'}
            {selectedStation === 'bar' && String.fromCodePoint(0x1F37A) + ' Bar Only'}
            {selectedStation === 'both' && String.fromCodePoint(0x1F4CB) + ' Both Stations'}
          </span>
        </div>
      </div>
    </div>
  );
});

StationSelector.displayName = 'StationSelector';

export default StationSelector;