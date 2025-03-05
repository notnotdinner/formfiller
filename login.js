// 登录相关功能模块
console.log('[login] 登录模块已加载');

/**
 * 登录信息处理类
 * 管理用户的登录状态和凭据
 */
class LoginManager {
  constructor() {
    this.isLoggedIn = false;
    this.credentials = null;
    this.lastLoginTime = null;
    this.loginExpiration = 24 * 60 * 60 * 1000; // 24小时过期时间
  }

  /**
   * 执行登录操作
   * @param {Object} credentials - 登录凭据
   * @returns {Promise<boolean>} - 登录是否成功
   */
  async login(credentials) {
    console.log('[login] 尝试登录...');
    
    try {
      // 这里可以实现实际的登录逻辑
      // 例如向后端发送登录请求
      
      // 模拟登录成功
      this.isLoggedIn = true;
      this.credentials = credentials;
      this.lastLoginTime = Date.now();
      
      // 保存登录状态
      this.saveLoginState();
      
      console.log('[login] 登录成功');
      return true;
    } catch (error) {
      console.error('[login] 登录失败:', error);
      return false;
    }
  }

  /**
   * 执行登出操作
   */
  logout() {
    console.log('[login] 执行登出');
    this.isLoggedIn = false;
    this.credentials = null;
    this.lastLoginTime = null;
    
    // 清除保存的登录状态
    this.clearLoginState();
  }

  /**
   * 检查用户是否已登录
   * @returns {Promise<boolean>} - 是否已登录的Promise
   */
  async checkLoginStatus() {
    // 首先尝试从存储中恢复登录状态
    await this.restoreLoginState();
    
    // 检查登录状态和过期时间
    if (this.isLoggedIn && this.lastLoginTime) {
      const currentTime = Date.now();
      const timeSinceLogin = currentTime - this.lastLoginTime;
      
      // 如果登录已过期，则自动登出
      if (timeSinceLogin > this.loginExpiration) {
        console.log('[login] 登录已过期，执行自动登出');
        this.logout();
        return false;
      }
      
      console.log('[login] 用户已登录，用户名:', this.credentials ? this.credentials.username : '未知');
      return true;
    }
    
    console.log('[login] 用户未登录');
    return false;
  }

  /**
   * 保存登录状态到存储
   * @private
   */
  saveLoginState() {
    if (chrome.storage && chrome.storage.local) {
      const loginState = {
        isLoggedIn: this.isLoggedIn,
        lastLoginTime: this.lastLoginTime,
        // 注意：出于安全考虑，不要存储完整的凭据
        // 只存储必要的信息
        userIdentifier: this.credentials ? this.credentials.username : null,
        // 添加密码以便认证
        password: this.credentials ? this.credentials.password : null
      };
      
      chrome.storage.local.set({ loginState }, function() {
        console.log('[login] 登录状态已保存');
      });
    }
  }

  /**
   * 从存储中恢复登录状态
   * @private
   * @returns {Promise<void>} 完成恢复操作的Promise
   */
  restoreLoginState() {
    return new Promise((resolve) => {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['loginState'], (result) => {
          if (result.loginState) {
            this.isLoggedIn = result.loginState.isLoggedIn;
            this.lastLoginTime = result.loginState.lastLoginTime;
            
            // 恢复用户凭据
            if (this.isLoggedIn && result.loginState.userIdentifier) {
              this.credentials = { 
                username: result.loginState.userIdentifier,
                password: result.loginState.password
              };
            }
            
            console.log('[login] 已恢复登录状态', this.isLoggedIn ? '已登录' : '未登录');
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 清除存储的登录状态
   * @private
   */
  clearLoginState() {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(['loginState'], function() {
        console.log('[login] 登录状态已清除');
      });
    }
  }

  /**
   * 自动填充登录表单
   * @param {Array} inputElements - 表单输入元素数组
   * @returns {boolean} - 是否成功填充
   */
  autoFillLoginForm(inputElements) {
    if (!this.credentials || !this.credentials.username) {
      console.log('[login] 无可用凭据，无法自动填充');
      return false;
    }
    
    console.log('[login] 尝试自动填充登录表单');
    let filledUsername = false;
    let filledPassword = false;
    
    inputElements.forEach(input => {
      // 尝试识别用户名输入框
      if (!filledUsername && this.isUsernameField(input)) {
        this.fillInputValue(input, this.credentials.username);
        filledUsername = true;
      }
      
      // 尝试识别密码输入框
      if (!filledPassword && this.isPasswordField(input) && this.credentials.password) {
        this.fillInputValue(input, this.credentials.password);
        filledPassword = true;
      }
    });
    
    return filledUsername || filledPassword;
  }

  /**
   * 判断是否为用户名输入字段
   * @param {Object} input - 输入元素
   * @returns {boolean} - 是否为用户名字段
   * @private
   */
  isUsernameField(input) {
    if (input.type === 'text' || input.type === 'email') {
      const attributes = [input.name, input.id, input.placeholder].filter(Boolean).map(attr => attr.toLowerCase());
      return attributes.some(attr => 
        attr.includes('user') || 
        attr.includes('name') || 
        attr.includes('email') || 
        attr.includes('account') ||
        attr.includes('用户') ||
        attr.includes('账号') ||
        attr.includes('邮箱'));
    }
    return false;
  }

  /**
   * 判断是否为密码输入字段
   * @param {Object} input - 输入元素
   * @returns {boolean} - 是否为密码字段
   * @private
   */
  isPasswordField(input) {
    return input.type === 'password' || 
           (input.name && input.name.toLowerCase().includes('password')) ||
           (input.id && input.id.toLowerCase().includes('password')) ||
           (input.placeholder && input.placeholder.toLowerCase().includes('password')) ||
           (input.name && input.name.toLowerCase().includes('密码')) ||
           (input.id && input.id.toLowerCase().includes('密码')) ||
           (input.placeholder && input.placeholder.toLowerCase().includes('密码'));
  }

  /**
   * 填充输入元素的值
   * @param {Object} input - 输入元素
   * @param {string} value - 要填充的值
   * @private
   */
  fillInputValue(input, value) {
    input.value = value;
    // 触发输入事件
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`[login] 已填充${input.type === 'password' ? '密码' : '用户名'}字段`);
  }

  /**
   * 获取用于API请求的认证头
   * @returns {Object} - 认证头对象
   */
  getAuthHeaders() {
    // 确保用户已登录
    if (!this.isLoggedIn || !this.credentials) {
      console.warn('[login] 尝试获取认证头信息但用户未登录');
      return {};
    }
    
    // 假设服务器接受Basic认证
    // 创建认证头 (username:password 的 Base64 编码)
    const authString = `${this.credentials.username}:${this.credentials.password}`;
    const base64Auth = btoa(authString);
    
    return {
      'Authorization': `Basic ${base64Auth}`
    };
  }
}

// 创建全局登录管理器实例
window.loginManager = new LoginManager(); 