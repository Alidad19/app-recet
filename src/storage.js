import AsyncStorage from '@react-native-async-storage/async-storage';

const USERS_KEY = '@electricity_users';
const AMPERE_PRICE_KEY = '@ampere_price';
const PIN_KEY = '@app_pin';
const THEME_KEY = '@app_theme';
const PRINT_SIZE_KEY = '@print_size';

// اسم صاحب المولدة كما يظهر للمشغل (للعرض فقط، لا يمكن للمشغل تعديله)
export const OPERATOR_OWNER_NAME_KEY = '@operator_owner_name';

export const getOperatorOwnerName = async () => {
  try {
    return (await AsyncStorage.getItem(OPERATOR_OWNER_NAME_KEY)) || '';
  } catch (error) {
    console.error('Error fetching operator owner name', error);
    return '';
  }
};

export const setOperatorOwnerName = async (name) => {
  try {
    const value = String(name || '').trim();
    if (value) {
      await AsyncStorage.setItem(OPERATOR_OWNER_NAME_KEY, value);
    }
  } catch (error) {
    console.error('Error saving operator owner name', error);
  }
};

export const getPrintSize = async () => {
  try {
    const size = await AsyncStorage.getItem(PRINT_SIZE_KEY);
    return size || 'large';
  } catch (error) {
    console.error('Error fetching print size', error);
    return 'large';
  }
};

export const setPrintSize = async (size) => {
  try {
    await AsyncStorage.setItem(PRINT_SIZE_KEY, size);
  } catch (error) {
    console.error('Error setting print size', error);
  }
};

export const getTheme = async () => {
  try {
    const theme = await AsyncStorage.getItem(THEME_KEY);
    return theme || 'light';
  } catch (error) {
    console.error('Error fetching theme', error);
    return 'light';
  }
};

export const setTheme = async (theme) => {
  try {
    await AsyncStorage.setItem(THEME_KEY, theme);
  } catch (error) {
    console.error('Error setting theme', error);
  }
};

export const getAppPin = async () => {
  try {
    const pin = await AsyncStorage.getItem(PIN_KEY);
    return pin || '';
  } catch (error) {
    console.error('Error fetching PIN', error);
    return '';
  }
};

export const setAppPin = async (pin) => {
  try {
    await AsyncStorage.setItem(PIN_KEY, pin);
  } catch (error) {
    console.error('Error setting PIN', error);
  }
};

export const getAmperePrice = async () => {
  try {
    const price = await AsyncStorage.getItem(AMPERE_PRICE_KEY);
    return price ? parseFloat(price) : 0;
  } catch (error) {
    console.error('Error fetching ampere price', error);
    return 0;
  }
};

export const setAmperePrice = async (price) => {
  try {
    await AsyncStorage.setItem(AMPERE_PRICE_KEY, price.toString());
  } catch (error) {
    console.error('Error setting ampere price', error);
  }
};

export const getUsers = async () => {
  try {
    const users = await AsyncStorage.getItem(USERS_KEY);
    return users ? JSON.parse(users) : [];
  } catch (error) {
    console.error('Error fetching users', error);
    return [];
  }
};

export const setUsers = async (users) => {
  try {
    await AsyncStorage.setItem(USERS_KEY, JSON.stringify(Array.isArray(users) ? users : []));
  } catch (error) {
    console.error('Error setting users', error);
  }
};

export const saveUser = async (user) => {
  try {
    const users = await getUsers();
    const newUser = {
      ...user,
      id: Date.now().toString(),
      payments: [],
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
    return newUser;
  } catch (error) {
    console.error('Error saving user', error);
  }
};

export const updateUser = async (updatedUser) => {
  try {
    const users = await getUsers();
    const index = users.findIndex(u => u.id === updatedUser.id);
    if (index !== -1) {
      users[index] = updatedUser;
      await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
  } catch (error) {
    console.error('Error updating user', error);
  }
};

export const deleteUser = async (id) => {
  try {
    const users = await getUsers();
    const filteredUsers = users.filter(u => u.id !== id);
    await AsyncStorage.setItem(USERS_KEY, JSON.stringify(filteredUsers));
  } catch (error) {
    console.error('Error deleting user', error);
  }
};

export const addPayment = async (userId, amount) => {
  try {
    const users = await getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index !== -1) {
      const payment = {
        id: Date.now().toString(),
        amount: parseFloat(amount),
        date: new Date().toISOString(),
      };
      
      if (!users[index].payments) {
        users[index].payments = [];
      }
      
      users[index].payments.push(payment);
      await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
      return users[index];
    }
  } catch (error) {
    console.error('Error adding payment', error);
  }
};
