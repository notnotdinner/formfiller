// 监听来自弹出窗口的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'extractFields') {
    // 获取要分析的文本
    const text = request.text;
    
    if (!text) {
      sendResponse({ success: false, error: '无文本可分析' });
      return true;
    }
    
    // 调用AI模型提取字段
    extractFieldsWithAI(text)
      .then(result => {
        sendResponse({
          success: true,
          data: result
        });
      })
      .catch(error => {
        console.error('提取字段时出错:', error);
        sendResponse({
          success: false,
          error: error.message || '提取字段失败'
        });
      });
    
    // 指示将异步发送响应
    return true;
  } else if (request.action === 'extractFieldsByLabels') {
    // 根据表单标签提取信息
    const text = request.text;
    const formFields = request.formFields;
    
    if (!text) {
      sendResponse({ success: false, error: '无文本可分析' });
      return true;
    }
    
    if (!formFields || !Array.isArray(formFields) || formFields.length === 0) {
      sendResponse({ success: false, error: '未找到表单字段' });
      return true;
    }
    
    // 根据表单标签提取信息
    extractFieldsByLabels(text, formFields)
      .then(result => {
        sendResponse({
          success: true,
          data: result
        });
      })
      .catch(error => {
        console.error('根据表单标签提取字段时出错:', error);
        sendResponse({
          success: false,
          error: error.message || '提取字段失败'
        });
      });
    
    // 指示将异步发送响应
    return true;
  }
});

// 使用AI模型提取字段
async function extractFieldsWithAI(text) {
  try {
    // 默认使用免费的AI模型API（可替换为其他API）
    const API_URL = 'https://api.openai.com/v1/chat/completions';
    const API_KEY = ''; // 此处需要用户自己填写API密钥
    
    // 如果没有配置API密钥，使用模拟数据进行演示
    if (!API_KEY) {
      console.warn('未配置API密钥，使用模拟数据进行演示');
      return simulateExtraction(text);
    }
    
    // 构建AI请求
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `你是一个表单信息提取助手。请从用户提供的文本中提取常见的表单字段信息，并以JSON格式返回，不要有任何其他说明。
            提取以下字段（如果存在）：姓名(name)、电话(phone)、邮箱(email)、地址(address)、城市(city)、省份(province)、
            邮编(zipcode)、公司(company)、职位(title)、性别(gender)等。只输出JSON格式，不要其他任何文字说明。`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      })
    });
    
    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`);
    }
    
    const result = await response.json();
    const content = result.choices[0].message.content;
    
    // 解析AI返回的JSON数据
    try {
      // 尝试直接解析JSON
      return JSON.parse(content);
    } catch (e) {
      // 如果直接解析失败，尝试从文本中提取JSON部分
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('无法解析AI返回的数据');
    }
  } catch (error) {
    console.error('AI提取失败:', error);
    // 出错时也返回模拟数据，确保功能可演示
    return simulateExtraction(text);
  }
}

// 根据表单标签提取信息
async function extractFieldsByLabels(text, formFields) {
  try {
    // 默认使用免费的AI模型API（可替换为其他API）
    const API_URL = 'https://api.openai.com/v1/chat/completions';
    const API_KEY = ''; // 此处需要用户自己填写API密钥
    
    // 提取所有标签文本，构建提示词
    const fieldLabels = formFields.map(field => field.label).filter(label => label);
    const fieldPrompt = fieldLabels.join(', ');
    
    console.log('根据以下标签提取信息:', fieldPrompt);
    
    // 如果没有配置API密钥，使用模拟数据进行演示
    if (!API_KEY) {
      console.warn('未配置API密钥，使用模拟数据进行演示');
      return simulateExtractionByLabels(text, formFields);
    }
    
    // 构建AI请求
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `你是一个表单信息提取助手。请从用户提供的文本中提取表单所需的字段信息，并以JSON格式返回，不要有任何其他说明。
            需要提取的字段标签有：${fieldPrompt}。
            以各标签为键，提取的对应值为值，组成JSON格式返回。只输出JSON格式，不要其他任何文字说明。`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      })
    });
    
    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`);
    }
    
    const result = await response.json();
    const content = result.choices[0].message.content;
    
    // 解析AI返回的JSON数据
    try {
      // 尝试直接解析JSON
      return JSON.parse(content);
    } catch (e) {
      // 如果直接解析失败，尝试从文本中提取JSON部分
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('无法解析AI返回的数据');
    }
  } catch (error) {
    console.error('AI提取失败:', error);
    // 出错时使用模拟提取，确保功能可演示
    return simulateExtractionByLabels(text, formFields);
  }
}

// 根据表单标签模拟提取信息
function simulateExtractionByLabels(text, formFields) {
  const result = {};
  
  // 遍历每个表单字段的标签，尝试提取匹配信息
  formFields.forEach(field => {
    if (!field.label) return;
    
    const label = field.label.toLowerCase();
    
    // 构建各种可能的标签表达方式
    const labelVariants = [
      label,
      label + '是', 
      label + '为', 
      '我的' + label, 
      '我' + label,
      label + '：',
      label + ':'
    ];
    
    // 构建提取模式
    const pattern = new RegExp(
      `(${labelVariants.join('|')})[是为:：]?\\s*([^，。,.\\n]{1,50})`, 'i'
    );
    
    const match = text.match(pattern);
    if (match) {
      result[field.label] = match[2].trim();
    }
  });
  
  // 如果没有匹配到任何字段，但有字段类型信息，尝试使用字段类型
  if (Object.keys(result).length === 0) {
    formFields.forEach(field => {
      if (!field.fieldType || field.fieldType === '未知') return;
      
      // 根据字段类型尝试提取
      const fieldType = field.fieldType.toLowerCase();
      
      if (fieldType === 'name') {
        const nameMatch = text.match(/(?:我叫|我是|姓名[是为:：]?|名字[是为:：]?)\s*([^\s,，。.、；;!！?？)(）（\d]{2,10})/);
        if (nameMatch && !result[field.label]) {
          result[field.label] = nameMatch[1].trim();
        }
      } else if (fieldType === 'phone') {
        const phoneMatch = text.match(/(?:电话[是为:：]?|手机[是为:：]?|联系方式[是为:：]?|联系电话[是为:：]?|tel[是为:：]?|phone[是为:：]?|手机号[是为:：]?)\s*(?:是|为)?[是为:：]?\s*((?:\+?86)?[- ]?1[3-9]\d{9}|(?:\d{3,4}[- ])?\d{7,8})/i);
        if (phoneMatch && !result[field.label]) {
          result[field.label] = phoneMatch[1].replace(/[- ]/g, '').trim();
        }
      } else if (fieldType === 'email') {
        const emailMatch = text.match(/(?:邮箱[是为:：]?|电子邮件[是为:：]?|邮件[是为:：]?|email[是为:：]?)\s*(?:是|为)?[是为:：]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
        if (emailMatch && !result[field.label]) {
          result[field.label] = emailMatch[1].trim();
        }
      } else if (fieldType === 'address') {
        const addressMatch = text.match(/(?:地址[是为:：]?|住址[是为:：]?|家庭住址[是为:：]?|收货地址[是为:：]?|address[是为:：]?)\s*(?:是|为)?[是为:：]?\s*([^，。,.\n]{5,50})/i);
        if (addressMatch && !result[field.label]) {
          result[field.label] = addressMatch[1].trim();
        }
      }
    });
  }
  
  // 如果仍然没有提取到任何信息，使用通用提取函数
  if (Object.keys(result).length === 0) {
    const generalResult = simulateExtraction(text);
    
    // 尝试将通用结果映射到表单字段
    formFields.forEach(field => {
      if (!field.label) return;
      
      const label = field.label.toLowerCase();
      
      // 尝试映射常见字段
      if (/姓名|名字|联系人|用户|用户名/i.test(label) && generalResult.name) {
        result[field.label] = generalResult.name;
      } else if (/电话|手机|联系方式|联系电话|phone|tel/i.test(label) && generalResult.phone) {
        result[field.label] = generalResult.phone;
      } else if (/邮箱|电子邮件|email|mail/i.test(label) && generalResult.email) {
        result[field.label] = generalResult.email;
      } else if (/地址|住址|收货地址|address/i.test(label) && generalResult.address) {
        result[field.label] = generalResult.address;
      } else if (/公司|单位|企业|company/i.test(label) && generalResult.company) {
        result[field.label] = generalResult.company;
      } else if (/职位|职务|title|job/i.test(label) && generalResult.title) {
        result[field.label] = generalResult.title;
      } else if (/性别|gender|sex/i.test(label) && generalResult.gender) {
        result[field.label] = generalResult.gender;
      }
    });
  }
  
  return result;
}

// 使用规则匹配模拟AI提取，用于没有API密钥或API调用失败时
function simulateExtraction(text) {
  const result = {};
  
  // 使用正则表达式匹配常见字段
  
  // 姓名匹配
  const nameMatch = text.match(/(?:我叫|我是|姓名[是为:：]?|名字[是为:：]?)\s*([^\s,，。.、；;!！?？)(）（\d]{2,10})/);
  if (nameMatch) {
    result.name = nameMatch[1].trim();
  }
  
  // 电话匹配
  const phoneMatch = text.match(/(?:电话[是为:：]?|手机[是为:：]?|联系方式[是为:：]?|联系电话[是为:：]?|tel[是为:：]?|phone[是为:：]?|手机号[是为:：]?)\s*(?:是|为)?[是为:：]?\s*((?:\+?86)?[- ]?1[3-9]\d{9}|(?:\d{3,4}[- ])?\d{7,8})/i);
  if (phoneMatch) {
    result.phone = phoneMatch[1].replace(/[- ]/g, '').trim();
  }
  
  // 邮箱匹配
  const emailMatch = text.match(/(?:邮箱[是为:：]?|电子邮件[是为:：]?|邮件[是为:：]?|email[是为:：]?)\s*(?:是|为)?[是为:：]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (emailMatch) {
    result.email = emailMatch[1].trim();
  }
  
  // 地址匹配
  const addressMatch = text.match(/(?:地址[是为:：]?|住址[是为:：]?|家庭住址[是为:：]?|收货地址[是为:：]?|address[是为:：]?)\s*(?:是|为)?[是为:：]?\s*([^，。,.\n]{5,50})/i);
  if (addressMatch) {
    result.address = addressMatch[1].trim();
  }
  
  // 公司匹配
  const companyMatch = text.match(/(?:公司[是为:：]?|单位[是为:：]?|企业[是为:：]?|company[是为:：]?)\s*(?:是|为)?[是为:：]?\s*([^，。,.\n]{2,30})/i);
  if (companyMatch) {
    result.company = companyMatch[1].trim();
  }
  
  // 职位匹配
  const titleMatch = text.match(/(?:职位[是为:：]?|职务[是为:：]?|title[是为:：]?|job[是为:：]?)\s*(?:是|为)?[是为:：]?\s*([^，。,.\n]{2,20})/i);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  }
  
  // 性别匹配
  const genderMatch = text.match(/(?:性别[是为:：]?|gender[是为:：]?|sex[是为:：]?)\s*(?:是|为)?[是为:：]?\s*(男|女|male|female|man|woman)/i);
  if (genderMatch) {
    const genderValue = genderMatch[1].toLowerCase();
    if (['男', 'male', 'man'].includes(genderValue)) {
      result.gender = '男';
    } else if (['女', 'female', 'woman'].includes(genderValue)) {
      result.gender = '女';
    }
  }
  
  return result;
} 