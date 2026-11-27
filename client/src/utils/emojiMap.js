export const getProductEmoji = (category) => {
  const cp = String.fromCodePoint;
  const key = String(category || '').trim().toLowerCase();
  const map = {
    'main course': cp(0x1F35B), 'main dish': cp(0x1F35B),
    'beverage': cp(0x1F964), 'drink': cp(0x1F964), 'drinks': cp(0x1F964),
    'juice': cp(0x1F9C3), 'coffee': cp(0x2615), 'tea': cp(0x1F375),
    'dessert': cp(0x1F370), 'appetizer': cp(0x1F362), 'soup': cp(0x1F372),
    'salad': cp(0x1F957), 'side': cp(0x1F957), 'breakfast': cp(0x1F373),
    'traditional': cp(0x1F1EA, 0x1F1F9), 'ethiopian': cp(0x1F1EA, 0x1F1F9),
    'ethiopian food': cp(0x1F1EA, 0x1F1F9), 'vegetarian': cp(0x1F96C)
  };
  return map[key] || cp(0x1F37D, 0xFE0F);
};