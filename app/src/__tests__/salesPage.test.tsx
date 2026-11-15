import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderApp } from '../testing/renderApp';

const settle = async (n = 5) => {
  for (let k = 0; k < n; k++) await act(async () => undefined);
};

describe('Sales page layout', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('shows the money summary, an Invoices and Quotes switch, and no Price book row', async () => {
    await renderApp('/sales');
    await settle();
    expect(screen.getByTestId('sales-summary')).toHaveTextContent(/Owed to you.*Collected this week/);
    expect(screen.getByTestId('invoices')).toBeTruthy();
    expect(screen.queryByTestId('sales-price-book')).toBeNull();
    expect(screen.queryByTestId('sales-followups')).toBeNull();
    await fireEvent.press(screen.getByTestId('sales-odoo-quotations'));
    expect(screen.getByTestId('sales-quotes')).toBeTruthy();
    expect(screen.queryByTestId('invoices')).toBeNull();
    await fireEvent.press(screen.getByTestId('sales-tab-invoices'));
    expect(screen.getByTestId('invoices')).toBeTruthy();
  });
});
