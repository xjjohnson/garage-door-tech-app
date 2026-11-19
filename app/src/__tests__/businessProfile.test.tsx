import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderApp } from '../testing/renderApp';

const settle = () => act(async () => {});

describe('Management > Your business (profile layout)', () => {
  it('shows the sections and keeps name and phone on the phone when not signed in', async () => {
    await renderApp('/business');
    await settle();
    for (const t of ['Identity', 'Contact', 'Payments', 'Branding']) expect(screen.getByText(t)).toBeTruthy();
    // Not signed in: only the phone's own name and phone, no Odoo-only boxes.
    expect(screen.getByTestId('business-name')).toBeTruthy();
    expect(screen.getByTestId('business-phone')).toBeTruthy();
    expect(screen.queryByTestId('business-vat')).toBeNull();
    expect(screen.queryByText('Documents')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('business-name'), 'Ace Doors');
    expect(screen.getByTestId('business-name').props.value).toBe('Ace Doors');
  });
});
