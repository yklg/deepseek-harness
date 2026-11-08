/** Copy owned by the ecom workbench launcher panel and its live-console tab. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Workbench sidebar label, launcher page, and live-console copy. */
    ecomWorkbench: EcomWorkbenchLocaleKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'panel.title': '电商工作台',
  'panel.heading': '电商工作台',
  'panel.description': '此启动页为占位实现。工作台能力随 Host 服务提供后在此接入。',
  'console.title': '实时控制台',
  'console.description': '当前没有已接入的自动化运行。Host 服务就绪后，控制台在此显示自动化任务的实时输出。',
} satisfies Record<string, string>

/** Key domain this plugin merges into the locale registry; every shipped language carries exactly these keys. */
export type EcomWorkbenchLocaleKey = keyof typeof zh

/** English dictionary, key-identical to the Chinese source of truth. */
export const en = {
  'panel.title': 'Ecom workbench',
  'panel.heading': 'Ecom workbench',
  'panel.description': 'This launcher is a placeholder. Workbench capabilities land here once the Host service provides them.',
  'console.title': 'Live console',
  'console.description': 'No automation run is connected yet. Once the Host service is ready, the console shows live automation output here.',
} satisfies Record<EcomWorkbenchLocaleKey, string>

/** Japanese dictionary, checked against the English keys. */
export const ja = {
  'panel.title': 'EC ワークベンチ',
  'panel.heading': 'EC ワークベンチ',
  'panel.description': 'この起動パネルはプレースホルダーです。ワークベンチの機能は Host サービスが提供され次第ここに追加されます。',
  'console.title': 'ライブコンソール',
  'console.description': '接続済みの自動化実行はまだありません。Host サービスの準備が整うと、ここに自動化のライブ出力が表示されます。',
} satisfies Record<keyof typeof en, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'panel.title': 'Espacio de trabajo de comercio electrónico',
  'panel.heading': 'Espacio de trabajo de comercio electrónico',
  'panel.description': 'Este panel de inicio es un marcador de posición. Las capacidades del espacio de trabajo se añadirán aquí cuando el servicio del Host las proporcione.',
  'console.title': 'Consola en vivo',
  'console.description': 'Todavía no hay ninguna ejecución de automatización conectada. Cuando el servicio del Host esté listo, la consola mostrará aquí la salida de automatización en vivo.',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'panel.title': 'Espace de travail e-commerce',
  'panel.heading': 'Espace de travail e-commerce',
  'panel.description': "Ce panneau de lancement est un emplacement réservé. Les capacités de l'espace de travail y seront ajoutées dès que le service Host les fournira.",
  'console.title': 'Console en direct',
  'console.description': "Aucune exécution d'automatisation n'est encore connectée. Dès que le service Host sera prêt, la console affichera ici la sortie d'automatisation en direct.",
} satisfies Record<keyof typeof en, string>

/** German dictionary, checked against the English keys. */
export const de = {
  'panel.title': 'E-Commerce-Workbench',
  'panel.heading': 'E-Commerce-Workbench',
  'panel.description': 'Dieses Startpanel ist ein Platzhalter. Die Workbench-Funktionen erscheinen hier, sobald der Host-Dienst sie bereitstellt.',
  'console.title': 'Live-Konsole',
  'console.description': 'Es ist noch keine Automatisierungsausführung verbunden. Sobald der Host-Dienst bereit ist, zeigt die Konsole hier die Live-Ausgabe der Automatisierung.',
} satisfies Record<keyof typeof en, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  'panel.title': 'Рабочая среда электронной коммерции',
  'panel.heading': 'Рабочая среда электронной коммерции',
  'panel.description': 'Эта стартовая панель — заглушка. Возможности рабочей среды появятся здесь, когда служба Host их предоставит.',
  'console.title': 'Консоль в реальном времени',
  'console.description': 'Подключённых запусков автоматизации пока нет. Когда служба Host будет готова, консоль покажет здесь вывод автоматизации в реальном времени.',
} satisfies Record<keyof typeof en, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  'panel.title': 'Ambiente de trabalho de comércio eletrônico',
  'panel.heading': 'Ambiente de trabalho de comércio eletrônico',
  'panel.description': 'Este painel inicial é um espaço reservado. Os recursos do ambiente de trabalho serão adicionados aqui quando o serviço do Host os fornecer.',
  'console.title': 'Console ao vivo',
  'console.description': 'Ainda não há nenhuma execução de automação conectada. Quando o serviço do Host estiver pronto, o console mostrará aqui a saída da automação ao vivo.',
} satisfies Record<keyof typeof en, string>
