import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import DashboardScreen from './src/screens/Dashboard/DashboardScreen';
import DiagnosticsListScreen from './src/screens/Diagnostics/DiagnosticsListScreen';
import TestDetailScreen from './src/screens/Diagnostics/TestDetailScreen';
import DisplayTestScreen from './src/screens/Diagnostics/DisplayTestScreen';
import TouchTestScreen from './src/screens/Diagnostics/TouchTestScreen';
import PhysicalButtonTestScreen from './src/screens/Diagnostics/PhysicalButtonTestScreen';
import BiometricTestScreen from './src/screens/Diagnostics/BiometricTestScreen';
import HistoryScreen from './src/screens/History/HistoryScreen';
import SessionDetailScreen from './src/screens/History/SessionDetailScreen';
import ReportsScreen from './src/screens/Reports/ReportsScreen';
import SettingsScreen from './src/screens/Settings/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: '#1E1E2E' },
  headerTintColor: '#E0E0E0',
  contentStyle: { backgroundColor: '#121212' },
};

function DiagnosticsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="DiagnosticsList" component={DiagnosticsListScreen} options={{ title: 'Diagnostics' }} />
      <Stack.Screen name="TestDetail" component={TestDetailScreen} options={{ title: 'Test Detail' }} />
      <Stack.Screen name="DisplayTest" component={DisplayTestScreen} options={{ title: 'Display Test', headerShown: false }} />
      <Stack.Screen name="TouchTest" component={TouchTestScreen} options={{ title: 'Touch Test', headerShown: false }} />
      <Stack.Screen name="PhysicalButtonTest" component={PhysicalButtonTestScreen} options={{ title: 'Physical Buttons', headerShown: false }} />
      <Stack.Screen name="BiometricTest" component={BiometricTestScreen} options={{ title: 'Biometric Test', headerShown: false }} />
    </Stack.Navigator>
  );
}

function HistoryStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="HistoryList" component={HistoryScreen} options={{ title: 'History' }} />
      <Stack.Screen name="SessionDetail" component={SessionDetailScreen} options={{ title: 'Session Detail' }} />
    </Stack.Navigator>
  );
}

function DashboardStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="DashboardHome" component={DashboardScreen} options={{ title: 'MAC Diagnostic Center' }} />
      <Stack.Screen name="DiagnosticsList" component={DiagnosticsListScreen} options={{ title: 'Diagnostics' }} />
      <Stack.Screen name="TestDetail" component={TestDetailScreen} options={{ title: 'Test Detail' }} />
      <Stack.Screen name="DisplayTest" component={DisplayTestScreen} options={{ title: 'Display Test', headerShown: false }} />
      <Stack.Screen name="TouchTest" component={TouchTestScreen} options={{ title: 'Touch Test', headerShown: false }} />
      <Stack.Screen name="PhysicalButtonTest" component={PhysicalButtonTestScreen} options={{ title: 'Physical Buttons', headerShown: false }} />
      <Stack.Screen name="BiometricTest" component={BiometricTestScreen} options={{ title: 'Biometric Test', headerShown: false }} />
      <Stack.Screen name="SessionDetail" component={SessionDetailScreen} options={{ title: 'Session Detail' }} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
      <NavigationContainer>
        <StatusBar style="light" />
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: { backgroundColor: '#1E1E2E', borderTopColor: '#2A2A3E', paddingBottom: 4, height: 56 },
            tabBarActiveTintColor: '#4CAF50',
            tabBarInactiveTintColor: '#888',
            tabBarIcon: ({ focused, color, size }) => {
              let iconName: keyof typeof Ionicons.glyphMap = 'home';
              switch (route.name) {
                case 'Dashboard': iconName = focused ? 'home' : 'home-outline'; break;
                case 'DiagnosticsTab': iconName = focused ? 'construct' : 'construct-outline'; break;
                case 'HistoryTab': iconName = focused ? 'time' : 'time-outline'; break;
                case 'Reports': iconName = focused ? 'document-text' : 'document-text-outline'; break;
                case 'Settings': iconName = focused ? 'settings' : 'settings-outline'; break;
              }
              return <Ionicons name={iconName} size={size} color={color} />;
            },
          })}
        >
          <Tab.Screen name="Dashboard" component={DashboardStack} />
          <Tab.Screen name="DiagnosticsTab" component={DiagnosticsStack} options={{ title: 'Diagnostics' }} />
          <Tab.Screen name="HistoryTab" component={HistoryStack} options={{ title: 'History' }} />
          <Tab.Screen name="Reports" component={ReportsScreen} />
          <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
      </NavigationContainer>
  );
}
