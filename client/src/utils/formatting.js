export const formatCurrency = function(value) {
  const num = parseFloat(value || 0);
  const rounded = Math.round(num * 100) / 100;
  return 'Br ' + rounded.toLocaleString(undefined, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

export const formatDate = function(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
};

export const getOrderStatusInfo = function(status) {
  const statusMap = {
    'pending_confirmation': { 
      label: 'Waiting for Waiter', 
      textColor: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
      icon: 'Clock'
    },
    'confirmed': { 
      label: 'Confirmed', 
      textColor: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      icon: 'CheckCircle'
    },
    'pending': { 
      label: 'In Kitchen', 
      textColor: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
      icon: 'Clock'
    },
    'preparing': { 
      label: 'Preparing', 
      textColor: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
      icon: 'ChefHat'
    },
    'ready': { 
      label: 'Ready for Pickup', 
      textColor: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      icon: 'Coffee'
    },
    'completed': { 
      label: 'Completed', 
      textColor: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
      icon: 'CheckCircle'
    },
    'cancelled': { 
      label: 'Cancelled', 
      textColor: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      icon: 'AlertCircle'
    }
  };
  return statusMap[status] || { 
    label: status, 
    textColor: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-700',
    icon: 'Clock'
  };
};

export const getProductEmoji = function(category) {
  const emojiMap = {
    'Main Course': '🍛',
    'Main Dish': '🍛',
    'Beverage': '🥤',
    'Drink': '🥤',
    'Drinks': '🥤',
    'Juice': '🧃',
    'Coffee': '☕',
    'Tea': '🍵',
    'Dessert': '🍰',
    'Appetizer': '🍢',
    'Soup': '🍲',
    'Salad': '🥗',
    'Side': '🥗',
    'Breakfast': '🍳',
    'Traditional': '🇪🇹',
    'Ethiopian': '🇪🇹',
    'Ethiopian Food': '🇪🇹',
    'Vegetarian': '🥬'
  };
  
  const key = (category || '').trim();
  return emojiMap[key] || '🍽️';
};

export const getStatusBadgeClasses = function(status) {
  const info = getOrderStatusInfo(status);
  return {
    container: info.bgColor + ' ' + info.textColor + ' px-2 py-1 rounded-full text-xs font-semibold',
    text: info.label,
    icon: info.icon
  };
};
