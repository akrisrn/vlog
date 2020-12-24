import Vue from 'vue';
import router from '@/router';
import App from '@/vue/App.vue';

Vue.config.productionTip = false;

new Vue({
  router,
  render: h => h(App),
}).$mount('#app');
