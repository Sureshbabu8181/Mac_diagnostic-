import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DashboardScreen from './src/screens/Dashboard/DashboardScreen';
import DiagnosticsListScreen from './src/screens/Diagnostics/DiagnosticsListScreen';
import TestDetailScreen from './src/screens/Diagnostics/TestDetailScreen';
import DisplayTestScreen from './src/screens/Diagnostics/DisplayTestScreen';
import TouchTestScreen from './src/screens/Diagnostics/TouchTestScreen';
import PhysicalButtonTestScreen from './src/screens/Diagnostics/PhysicalButtonTestScreen';
import BiometricTestScreen from './src/screens/Diagnostics/BiometricTestScreen';
import CameraTestScreen from './src/screens/Diagnostics/CameraTestScreen';
import MicrophoneTestScreen from './src/screens/Diagnostics/MicrophoneTestScreen';
import SpeakerTestScreen from './src/screens/Diagnostics/SpeakerTestScreen';
import HistoryScreen from './src/screens/History/HistoryScreen';
import SessionDetailScreen from './src/screens/History/SessionDetailScreen';
import ReportsScreen from './src/screens/Reports/ReportsScreen';
import SettingsScreen from './src/screens/Settings/SettingsScreen';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();
const DiagStack = createNativeStackNavigator();
const HistoryStack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: '#1E1E2E' },
  headerTintColor: '#E0E0E0',
  contentStyle: { backgroundColor: '#121212' },
};

function DiagnosticsStack() {
  return (
    <DiagStack.Navigator screenOptions={screenOptions}>
      <DiagStack.Screen name="DiagnosticsList" component={DiagnosticsListScreen} options={{ title: 'Diagnostics' }} />
      <DiagStack.Screen name="TestDetail" component={TestDetailScreen} options={{ title: 'Test Detail' }} />
    </DiagStack.Navigator>
  );
}

function HistoryStackNavigator() {
  return (
    <HistoryStack.Navigator screenOptions={screenOptions}>
      <HistoryStack.Screen name="HistoryList" component={HistoryScreen} options={{ title: 'History' }} />
      <HistoryStack.Screen name="SessionDetail" component={SessionDetailScreen} options={{ title: 'Session Detail' }} />
    </HistoryStack.Navigator>
  );
}

function Tabs() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 20);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1E1E2E',
          borderTopColor: '#2A2A3E',
          paddingBottom: bottomPadding,
          paddingTop: 6,
          height: 56 + bottomPadding,
        },
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
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="DiagnosticsTab" component={DiagnosticsStack} options={{ title: 'Diagnostics' }} />
      <Tab.Screen name="HistoryTab" component={HistoryStackNavigator} options={{ title: 'History' }} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Tabs" component={Tabs} />
        <RootStack.Screen name="DisplayTest" component={DisplayTestScreen} options={{ animation: 'slide_from_bottom' }} />
        <RootStack.Screen name="TouchTest" component={TouchTestScreen} options={{ animation: 'slide_from_bottom' }} />
        <RootStack.Screen name="PhysicalButtonTest" component={PhysicalButtonTestScreen} options={{ animation: 'slide_from_bottom' }} />
        <RootStack.Screen name="BiometricTest" component={BiometricTestScreen} options={{ animation: 'slide_from_bottom' }} />
        <RootStack.Screen name="CameraTest" component={CameraTestScreen} options={{ animation: 'slide_from_bottom' }} />
        <RootStack.Screen name="MicrophoneTest" component={MicrophoneTestScreen} options={{ animation: 'slide_from_bottom' }} />
        <RootStack.Screen name="SpeakerTest" component={SpeakerTestScreen} options={{ animation: 'slide_from_bottom' }} />
        <RootStack.Screen name="SessionDetail" component={SessionDetailScreen} options={{ headerShown: true, ...screenOptions, title: 'Session Detail' }} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
