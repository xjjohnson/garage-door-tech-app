import { act, fireEvent, screen } from '@testing-library/react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { setFirstRunForTests } from '../lib/firstRun';
import { resetLaunchPicked, setActiveRole } from '../lib/activeRole';
import { renderApp } from '../testing/renderApp';

const held = ['fieldservice.group_fsm_dispatcher', 'sales_team.group_sale_manager'];
const client = {
  session: { apps: {}, kind: 'oca', uid: 5, name: 'Dee', me: 9, url: 'u', db: 'd', login: 'l' },
  call: async (model: string, method: string, args: unknown[] = []) => (`${model}.${method}` === 'res.users.has_group' ? held.includes(args[1] as string) : []),
};
let mockState: { status: string; client: unknown } = { status: 'signedOut', client: null };
const mockListeners = new Set<() => void>();
const set = (s: typeof mockState) => {
  mockState = s;
  mockListeners.forEach((l) => l());
};
jest.mock('../lib/useOdoo', () => {
  const React = require('react');
  return {
    ...jest.requireActual('../lib/useOdoo'),
    useOdoo: () => {
      const [, bump] = React.useState(0);
      React.useEffect(() => {
        const l = () => bump((n: number) => n + 1);
        mockListeners.add(l);
        return () => mockListeners.delete(l);
      }, []);
      return { ...mockState, saved: null, error: '', signIn: async () => true, signOut: async () => undefined, refresh: async () => false };
    },
  };
});

describe('first-run setup comes before the role screen', () => {
  afterEach(() => setFirstRunForTests(false));

  it('signing in on the setup screen keeps the setup steps; Continue then goes to the role screen', async () => {
    setFirstRunForTests(true);
    resetLaunchPicked();
    setActiveRole(null);
    const app = await renderApp('/');
    for (let i = 0; i < 8; i++) await act(async () => undefined);
    expect(screen.getByTestId('first-run-setup')).toBeTruthy();
    await act(async () => set({ status: 'signedIn', client }));
    for (let i = 0; i < 8; i++) await act(async () => undefined);
    expect(screen.getByTestId('first-run-continue')).toBeTruthy();
    expect(app.getPathname()).not.toBe('/roles');
    await fireEvent.press(screen.getByTestId('first-run-continue'));
    for (let i = 0; i < 8; i++) await act(async () => undefined);
    expect(app.getPathname()).toBe('/roles');
  });
});
