import { useState, useEffect } from 'react';
export function useDebounce<T>(value: T, delay: number): T {
//useDebounce的"防抖"工作流程如下：
//它接收一个频繁变化的值（value）和一个延迟时间（delay，以毫秒为单位）。
//它并不会立即返回这个新值，而是会启动一个内部计时器。
//如果在计时器倒计时结束前，value 再次发生了变化，它会重置计时器，并使用最新的 value 重新开始倒计时。
//只有当 value 停止变化，并且计时器成功地完成了整个倒计时后，这个 Hook 才会返回最新的 value。
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
   
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, 
 
  [value, delay]);

  return debouncedValue;
}