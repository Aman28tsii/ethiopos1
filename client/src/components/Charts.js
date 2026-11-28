import React from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { useLanguage } from '../context/LanguageContext';
import { formatCurrency } from '../utils/formatting';

const COLORS = ['#059669', '#0d9488', '#d97706', '#dc2626', '#ea580c'];

export const RevenueChart = ({ data, title }) => {
  const { t } = useLanguage();
  
  if (!data || data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center">
        <p className="text-gray-500">{t('noData')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
      <h3 className="text-gray-900 dark:text-white font-semibold mb-4">{title || t('revenueProfitTrend')}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" stroke="#9ca3af" />
          <YAxis stroke="#9ca3af" tickFormatter={function(value) { return 'Br ' + value; }} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
            formatter={function(value) { return formatCurrency(value); }}
            labelFormatter={function(label) { return t('date') + ': ' + label; }}
          />
          <Legend formatter={function(value) { return t(value.toLowerCase()); }} />
          <Line type="monotone" dataKey="revenue" stroke="#059669" name="revenue" strokeWidth={2} dot={{ r: 4 }} />
          <Line type="monotone" dataKey="profit" stroke="#10b981" name="profit" strokeWidth={2} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export const TopProductsChart = ({ data, title }) => {
  const { t } = useLanguage();
  
  if (!data || data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center">
        <p className="text-gray-500">{t('noData')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
      <h3 className="text-gray-900 dark:text-white font-semibold mb-4">{title || t('topSellingProducts')}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="vertical" margin={{ left: 80 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis type="number" stroke="#9ca3af" tickFormatter={function(value) { return 'Br ' + value; }} />
          <YAxis type="category" dataKey="name" stroke="#9ca3af" width={100} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
            formatter={function(value) { return formatCurrency(value); }}
            labelFormatter={function(label) { return t('product') + ': ' + label; }}
          />
          <Bar dataKey="revenue" fill="#ea580c" name={t('revenue')} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const PaymentMethodsChart = ({ data, title }) => {
  const { t } = useLanguage();
  
  if (!data || data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center">
        <p className="text-gray-500">{t('noData')}</p>
      </div>
    );
  }

  const translatePaymentMethod = function(method) {
    const methods = {
      'cash': t('cash'),
      'card': t('card'),
      'mobile': t('mobile')
    };
    return methods[method] || method;
  };

  const translatedData = data.map(function(item) {
    return {
      ...item,
      payment_method: translatePaymentMethod(item.payment_method)
    };
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
      <h3 className="text-gray-900 dark:text-white font-semibold mb-4">{title || t('paymentMethods')}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={translatedData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={function({ name, percent }) { return name + ': ' + (percent * 100).toFixed(0) + '%'; }}
            outerRadius={100}
            fill="#0d9488"
            dataKey="total"
            nameKey="payment_method"
          >
            {translatedData.map(function(entry, index) {
              return <Cell key={'cell-' + index} fill={COLORS[index % COLORS.length]} />;
            })}
          </Pie>
          <Tooltip 
            contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
            formatter={function(value) { return formatCurrency(value); }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export const HourlySalesChart = ({ data, title }) => {
  const { t } = useLanguage();
  
  if (!data || data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center">
        <p className="text-gray-500">{t('noData')}</p>
      </div>
    );
  }

  const formattedData = data.map(function(item) {
    return {
      ...item,
      hour: String(item.hour).padStart(2, '0') + ':00'
    };
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
      <h3 className="text-gray-900 dark:text-white font-semibold mb-4">{title || t('hourlySalesTrend')}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="hour" stroke="#9ca3af" label={{ value: t('hour'), position: 'insideBottom', offset: -5 }} />
          <YAxis stroke="#9ca3af" tickFormatter={function(value) { return 'Br ' + value; }} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
            formatter={function(value) { return formatCurrency(value); }}
            labelFormatter={function(label) { return t('hour') + ': ' + label; }}
          />
          <Legend formatter={function(value) { return t(value.toLowerCase()); }} />
          <Area type="monotone" dataKey="revenue" stackId="1" stroke="#059669" fill="#059669" fillOpacity={0.3} name="revenue" />
          <Area type="monotone" dataKey="orders" stackId="2" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} name="orders" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
