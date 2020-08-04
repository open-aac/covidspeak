Rails.application.routes.draw do
  # For details on the DSL available within this file, see http://guides.rubyonrails.org/routing.html
  root 'index#index' 
  get '/thanks' => 'index#thanks'
  get '/about' => 'index#about'
  get '/intro' => 'index#intro'
  get '/terms' => 'index#terms'
  get '/privacy' => 'index#privacy'
  get '/rooms/pending/:room_id' => 'index#pending_room'
  get '/rooms/:room_id' => 'index#room'
  get '/rooms/:room_id/join' => 'index#join'
  get '/schedule/:schedule_id' => 'index#schedule'
  get '/admin' => 'index#admin'
  get '/accounts/:admin_code' => 'index#account'
  get '/accounts/:admin_code/activate/:check_id' => 'index#activate_account_code'
  get '/bundles/:code' => 'index#bundle'
  
  get '/pricing' => 'purchasing#pricing'
  get '/purchasing/success' => 'purchasing#success'
  post '/api/v1/purchasing/setup' => 'purchasing#initiate'
  post '/api/v1/purchasing/confirm' => 'purchasing#confirm'
  post '/api/v1/purchasing/modify' => 'purchasing#update_billing'
  post '/api/v1/purchasing/cancel' => 'purchasing#cancel'

  mount ActionCable.server => '/cable'

  scope 'api/v1', module: 'api' do
    resources :rooms do
      post 'keepalive' => 'rooms#keepalive'
      get 'coming' => 'rooms#user_coming'
      get 'status' => 'rooms#status'
      post 'activate' => 'rooms#activate'
    end
    resources :users
    post 'feedback' => 'users#feedback'
    post 'tokens' => 'tokens#token'
    post 'tokens/admin_code' => 'tokens#email_admin_code'
    get 'tokens/admin_code/:check_id' => 'tokens#check_admin_code'
    post 'bundles' => 'users#bundle'
    get 'tokens/check' => 'tokens#check_token'
    get 'feedback' => 'accounts#feedback'
    
    resources :accounts do
      post 'sub_ids' => 'accounts#sub_id'
      post 'join_code' => 'accounts#join_code', on: :collection
      post 'purchasing_events' => 'accounts#purchasing_event', on: :collection
      get 'rooms' => 'rooms#list_schedule'
      post 'invite' => 'rooms#invite'
      post 'rooms' => 'rooms#schedule'
    end
  end
end
