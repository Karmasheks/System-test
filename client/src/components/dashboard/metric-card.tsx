import { BarChart2, Briefcase, CheckCircle, Wrench, AlertTriangle, Settings } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  change: number;
  icon: string;
}

export function MetricCard({ title, value, change, icon }: MetricCardProps) {
  const isPositive = change >= 0;
  const iconClasses = {
    equipment: {
      bg: "bg-blue-100 dark:bg-blue-950",
      text: "text-blue-700 dark:text-blue-300",
      icon: <Wrench />,
      progress: 100,
    },
    completed: {
      bg: "bg-green-100 dark:bg-green-950",
      text: "text-green-700 dark:text-green-300",
      icon: <CheckCircle />,
      progress: 67,
    },
    overdue: {
      bg: "bg-yellow-100 dark:bg-yellow-950",
      text: "text-yellow-700 dark:text-yellow-300",
      icon: <AlertTriangle />,
      progress: 7,
    },
    repairs: {
      bg: "bg-red-100 dark:bg-red-950",
      text: "text-red-700 dark:text-red-300",
      icon: <Settings />,
      progress: 12,
    },
  };

  const iconType = icon in iconClasses ? icon : "equipment";
  const { bg, text, icon: iconComponent, progress } = iconClasses[iconType as keyof typeof iconClasses];

  return (
    <div className="bg-white rounded-lg shadow p-5 transition-all hover:shadow-md dark:bg-gray-800">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-sm text-gray-500 uppercase tracking-wider dark:text-gray-400">{title}</h3>
          <div className="mt-2 flex items-baseline">
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
            <p className={`ml-2 text-sm font-medium ${isPositive ? 'text-success-500 dark:text-success-400' : 'text-error-500 dark:text-error-400'}`}>
              <i className={`fas fa-arrow-${isPositive ? 'up' : 'down'} text-xs mr-0.5`}></i>
              <span>{Math.abs(change)}%</span>
            </p>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">по сравнению с прошлым месяцем</p>
        </div>
        <div className={`${bg} rounded-full p-3 ${text}`}>
          {iconComponent}
        </div>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500 dark:text-gray-400">Прогресс</div>
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{progress}%</div>
        </div>
        <div className="mt-1 w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
          <div 
            className="bg-primary-600 h-1.5 rounded-full dark:bg-primary-500" 
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}
