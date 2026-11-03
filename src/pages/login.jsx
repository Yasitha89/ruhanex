import { useState } from "react";
import { useAuth } from "../services/authContext";
import { Alert, Form, Input, Button, Typography } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { Navigate, useNavigate } from "react-router-dom";

const { Title } = Typography;

export default function Login() {
  const navigate = useNavigate();

  const { user, login, loading: sessionLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onFinish = async ({username,password}) => {
    setBusy(true); setError('');
    try {
      const account = await login(username.trim(),password);
      navigate(account.mustChangePassword ? '/profile' : '/dashboard', {replace:true});
    } catch(err) { setError(err.response?.data?.error || err.message || 'Unable to sign in.'); }
    finally { setBusy(false); }
  };
  if (user) return <Navigate to={user.mustChangePassword ? '/profile' : '/dashboard'} replace />;
  return <div style={styles.container}><div style={styles.glassCard}>
    <img src="/logo.png" alt="Company Logo" style={styles.logo} />
    <Title level={3} style={{color:'#fff',textAlign:'center'}}>Ruhanex Technologies</Title>
    {error && <Alert type="error" showIcon title={error} style={{marginBottom:16}} />}
    <Form layout="vertical" onFinish={onFinish} disabled={busy || sessionLoading}>
      <Form.Item name="username" rules={[{required:true}]}><Input prefix={<UserOutlined />} placeholder="Username" autoComplete="username" style={styles.input} /></Form.Item>
      <Form.Item name="password" rules={[{required:true}]}><Input.Password prefix={<LockOutlined />} placeholder="Password" autoComplete="current-password" style={styles.input} /></Form.Item>
      <Button type="primary" htmlType="submit" block loading={busy || sessionLoading} style={{height:42,fontWeight:'bold'}}>Login</Button>
    </Form>
  </div></div>;
}
const styles={
  container:{minHeight:'100dvh',width:'100%',display:'flex',justifyContent:'center',alignItems:'center',background:'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)'},
  glassCard:{width:'min(380px, calc(100vw - 32px))',padding:30,borderRadius:20,background:'rgba(255, 255, 255, 0.08)',backdropFilter:'blur(15px)',WebkitBackdropFilter:'blur(15px)',border:'1px solid rgba(255,255,255,0.2)',boxShadow:'0 8px 32px rgba(0,0,0,0.3)'},
  logo:{width:90,height:90,borderRadius:'50%',objectFit:'cover',display:'block',margin:'0 auto 15px',border:'2px solid rgba(255,255,255,0.4)'},
  input:{height:40},
};
