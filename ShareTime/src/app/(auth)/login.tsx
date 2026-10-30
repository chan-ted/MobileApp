return (
    <View style={{ flex: 1, backgroundColor: '#E0F2FE', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#0F172A', marginBottom: 20 }}>
        TEST LOGIN SCREEN
      </Text>

      {/* Email Input */}
      <TextInput
        style={{
          height: 52,
          backgroundColor: '#FFFFFF',
          borderWidth: 2,
          borderColor: '#0284C7',
          borderRadius: 8,
          paddingHorizontal: 16,
          fontSize: 16,
          marginBottom: 16,
          color: '#000000',
        }}
        placeholder="Email address"
        placeholderTextColor="#64748B"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
      />

      {/* Password Input */}
      <TextInput
        style={{
          height: 52,
          backgroundColor: '#FFFFFF',
          borderWidth: 2,
          borderColor: '#0284C7',
          borderRadius: 8,
          paddingHorizontal: 16,
          fontSize: 16,
          marginBottom: 16,
          color: '#000000',
        }}
        placeholder="Password"
        placeholderTextColor="#64748B"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {/* Action Button */}
      <TouchableOpacity
        style={{
          height: 52,
          backgroundColor: '#0284C7',
          borderRadius: 8,
          justifyContent: 'center',
          alignItems: 'center',
        }}
        onPress={handleLogin}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>Log In</Text>
      </TouchableOpacity>
    </View>
  );